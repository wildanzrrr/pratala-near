//! Lot lifecycle: registration, attestations, listing, cancellation, weigh-in, crop failure.
//!
//! Only `register_lot` is payable. Every other method here takes no deposit so verifiers and
//! farmers can sign with a function-call access key; the bounded storage they add is paid from
//! the reserve collected at registration.

use near_contract_standards::non_fungible_token::TokenId;
use near_contract_standards::non_fungible_token::events::NftMint;
use near_contract_standards::non_fungible_token::metadata::TokenMetadata;
use near_sdk::json_types::U128;
use near_sdk::{AccountId, NearToken, Promise, env, near, require};

use crate::errors::*;
use crate::escrow::{compute_settlement, holder_split};
use crate::events::*;
use crate::types::{Attestation, AttestationKind, ClaimKind, Claims, Lot, Role, Status};
use crate::validate;
use crate::{Contract, ContractExt, MAX_ATTESTATIONS};

/// Storage kept back at registration to pay for the attestations, settlement fields and up to
/// `MAX_SHARES_PER_LOT` share NFTs the lot accumulates later (≈ 0.48 NEAR at 10^19 yocto/byte;
/// the registration deposit is 0.6 NEAR with the excess refunded).
pub const LOT_STORAGE_RESERVE_BYTES: u64 = 48_000;

#[near]
impl Contract {
    /// Registers a harvest projection and mints its NFT to the caller, who becomes the farmer.
    /// Charges measured storage plus `LOT_STORAGE_RESERVE_BYTES`; the excess deposit is refunded.
    #[payable]
    #[allow(clippy::too_many_arguments)]
    pub fn register_lot(
        &mut self,
        crop: String,
        variety: Option<String>,
        region: String,
        projected_kg: u64,
        harvest_month: String,
        plot_hash: String,
        gps_hash: String,
        area_m2: Option<u64>,
        media_uri: Option<String>,
        reference: Option<String>,
    ) -> TokenId {
        self.assert_not_paused();
        validate::required_str(&crop);
        validate::optional_str(&variety);
        validate::required_str(&region);
        validate::month(&harvest_month);
        validate::hash(&plot_hash);
        validate::hash(&gps_hash);
        validate::optional_str(&media_uri);
        validate::optional_str(&reference);
        require!(projected_kg > 0, ERR_ZERO_KG);

        let initial_storage = env::storage_usage();
        let farmer_id = env::predecessor_account_id();
        let lot_id = format!("lot-{}", self.next_lot_id);
        self.next_lot_id += 1;

        let token_metadata = TokenMetadata {
            title: Some(format!("{crop} · {projected_kg} kg · {harvest_month}")),
            description: Some(format!(
                "Pratala harvest lot {lot_id}: {crop} from {region}, {projected_kg} kg projected for {harvest_month}."
            )),
            media: media_uri,
            media_hash: None,
            copies: Some(1),
            issued_at: None,
            expires_at: None,
            starts_at: None,
            updated_at: None,
            extra: None,
            reference,
            reference_hash: None,
        };

        self.save_lot(Lot {
            lot_id: lot_id.clone(),
            farmer_id: farmer_id.clone(),
            crop: crop.clone(),
            variety,
            region,
            projected_kg,
            harvest_month: harvest_month.clone(),
            plot_hash,
            gps_hash,
            area_m2,
            price_per_kg: 0,
            status: Status::Registered,
            attestations: Vec::new(),
            sold_kg: 0,
            shares: Vec::new(),
            next_share_no: 1,
            escrow: 0,
            funded_at_ms: None,
            fee_bps: 0,
            holder_pool: 0,
            actual_kg: None,
            grade: None,
            settled_at_ms: None,
            claims: Claims::default(),
            claim_lock: false,
            created_at_ms: env::block_timestamp_ms(),
        });
        // No refund account: storage is settled below for lot + token together.
        self.tokens.internal_mint_with_refund(
            lot_id.clone(),
            farmer_id.clone(),
            Some(token_metadata),
            None,
        );
        self.flush_lots();

        let used = env::storage_usage().saturating_sub(initial_storage) + LOT_STORAGE_RESERVE_BYTES;
        charge_storage(used);

        NftMint {
            owner_id: &farmer_id,
            token_ids: &[&lot_id],
            memo: None,
        }
        .emit();
        PratalaEvent::LotRegistered(vec![LotRegistered {
            lot_id: lot_id.clone(),
            farmer_id,
            crop,
            projected_kg,
            harvest_month,
        }])
        .emit();
        lot_id
    }

    /// FieldAgent visit: Registered → FieldVerified.
    pub fn attest_field(
        &mut self,
        lot_id: TokenId,
        evidence_hash: String,
        evidence_uri: Option<String>,
        gps_hash: String,
        ai_check_hash: Option<String>,
        note: Option<String>,
    ) {
        self.assert_not_paused();
        let signer = self.assert_role(Role::FieldAgent, ERR_NOT_FIELD_AGENT);
        validate::hash(&gps_hash);
        let mut lot = self.lot(&lot_id);
        require!(lot.status == Status::Registered, ERR_BAD_STATUS);
        let attestation = new_attestation(
            &lot,
            AttestationKind::FieldVisit,
            signer,
            evidence_hash,
            evidence_uri,
            ai_check_hash,
            note,
        );
        push_attestation(
            &mut lot,
            Attestation {
                gps_hash: Some(gps_hash),
                ..attestation
            },
        );
        lot.status = Status::FieldVerified;
        self.save_lot(lot);
    }

    /// Coop review: FieldVerified → CoopVerified. The reviewer must not be the field agent.
    pub fn attest_coop(
        &mut self,
        lot_id: TokenId,
        evidence_hash: String,
        evidence_uri: Option<String>,
        note: Option<String>,
    ) {
        self.assert_not_paused();
        let signer = self.assert_role(Role::Coop, ERR_NOT_COOP);
        let mut lot = self.lot(&lot_id);
        require!(lot.status == Status::FieldVerified, ERR_BAD_STATUS);
        require!(
            lot.last_signer(AttestationKind::FieldVisit) != Some(&signer),
            ERR_COOP_IS_FIELD_SIGNER
        );
        let attestation = new_attestation(
            &lot,
            AttestationKind::CoopReview,
            signer,
            evidence_hash,
            evidence_uri,
            None,
            note,
        );
        push_attestation(&mut lot, attestation);
        lot.status = Status::CoopVerified;
        self.counters.verified_lots += 1;
        self.save_lot(lot);
    }

    /// CoopVerified → Listed at `price_per_kg` (pUSDC base units per kg).
    pub fn list_lot(&mut self, lot_id: TokenId, price_per_kg: U128) {
        self.set_price(lot_id, price_per_kg, Status::CoopVerified);
    }

    /// Re-prices a Listed lot.
    pub fn update_price(&mut self, lot_id: TokenId, price_per_kg: U128) {
        self.set_price(lot_id, price_per_kg, Status::Listed);
    }

    /// Listed → CoopVerified; the price resets to 0. Impossible once any kg is sold: the
    /// committed escrow may only leave the contract through settlement.
    pub fn delist_lot(&mut self, lot_id: TokenId) {
        let mut lot = self.lot(&lot_id);
        self.assert_farmer(&lot);
        require!(lot.status == Status::Listed, ERR_BAD_STATUS);
        require!(lot.sold_kg == 0, ERR_HAS_SALES);
        lot.status = Status::CoopVerified;
        lot.price_per_kg = 0;
        self.save_lot(lot);
        PratalaEvent::LotDelisted(vec![LotRef { lot_id }]).emit();
    }

    /// Closes funding early with partial escrow: Listed → Funded once at least one kg is sold.
    /// The farmer calls it when the harvest is ready and unsold kg will stay unsold; selling
    /// out closes the lot automatically in `ft_on_transfer`. Not blocked by pause so buyers
    /// always have a path to settlement.
    pub fn close_funding(&mut self, lot_id: TokenId) {
        let mut lot = self.lot(&lot_id);
        let caller = env::predecessor_account_id();
        require!(
            caller == lot.farmer_id || caller == self.owner_id,
            ERR_NOT_FARMER_OR_OWNER
        );
        require!(lot.status == Status::Listed, ERR_BAD_STATUS);
        require!(lot.sold_kg > 0, ERR_NOTHING_SOLD);
        let sold_kg = lot.sold_kg;
        let projected_kg = lot.projected_kg;
        lot.status = Status::Funded;
        self.save_lot(lot);
        self.counters.funded_lots += 1;
        PratalaEvent::LotFundingClosed(vec![LotFundingClosed {
            lot_id,
            sold_kg,
            projected_kg,
            closed_by: caller,
        }])
        .emit();
    }

    /// Registered / FieldVerified / CoopVerified → Cancelled. The NFT stays with the farmer and
    /// can no longer move. Impossible once any kg is sold: committed escrow cannot be cancelled.
    pub fn cancel_lot(&mut self, lot_id: TokenId) {
        let mut lot = self.lot(&lot_id);
        let caller = env::predecessor_account_id();
        require!(
            caller == lot.farmer_id || caller == self.owner_id,
            ERR_NOT_FARMER_OR_OWNER
        );
        require!(
            matches!(
                lot.status,
                Status::Registered | Status::FieldVerified | Status::CoopVerified
            ),
            ERR_BAD_STATUS
        );
        require!(lot.sold_kg == 0, ERR_HAS_SALES);
        lot.status = Status::Cancelled;
        self.save_lot(lot);
        PratalaEvent::LotCancelled(vec![LotRef { lot_id }]).emit();
    }

    /// Warehouse weigh-in: Funded → Settled. Splits the escrow into the farmer claim, the
    /// treasury claim (fee + dust) and one refund entitlement per share NFT
    /// (see `escrow::compute_settlement`).
    pub fn weigh_in(
        &mut self,
        lot_id: TokenId,
        actual_kg: u64,
        grade: String,
        evidence_hash: String,
        evidence_uri: Option<String>,
        ai_check_hash: Option<String>,
    ) {
        self.assert_not_paused();
        let signer = self.assert_role(Role::Warehouse, ERR_NOT_WAREHOUSE);
        validate::required_str(&grade);
        let mut lot = self.lot(&lot_id);
        require!(lot.status == Status::Funded, ERR_BAD_STATUS);
        let attestation = new_attestation(
            &lot,
            AttestationKind::WarehouseWeighIn,
            signer,
            evidence_hash,
            evidence_uri,
            ai_check_hash,
            None,
        );
        push_attestation(
            &mut lot,
            Attestation {
                actual_kg: Some(actual_kg),
                grade: Some(grade.clone()),
                ..attestation
            },
        );

        let sold_kg = lot.sold_kg;
        let s = compute_settlement(
            sold_kg,
            actual_kg,
            lot.price_per_kg,
            lot.escrow,
            lot.fee_bps,
            &lot.shares,
        );
        lot.holder_pool = s.holder_pool;
        lot.claims.set(ClaimKind::Farmer, s.farmer);
        lot.claims.set(ClaimKind::Treasury, s.treasury);
        lot.claims.set(ClaimKind::Holder, s.holder);
        lot.actual_kg = Some(actual_kg);
        lot.grade = Some(grade.clone());
        lot.settled_at_ms = Some(env::block_timestamp_ms());
        lot.status = Status::Settled;
        self.counters.settled_lots += 1;
        self.counters.settled_volume = self
            .counters
            .settled_volume
            .checked_add(s.gross)
            .unwrap_or_else(|| env::panic_str(ERR_OVERFLOW));
        self.save_lot(lot);

        PratalaEvent::LotSettled(vec![LotSettled {
            lot_id,
            actual_kg,
            grade,
            sold_kg,
            farmer_claim: U128(s.farmer),
            holder_pool: U128(s.holder_pool),
            fee: U128(s.treasury),
        }])
        .emit();
    }

    /// Coop or owner declares crop failure: Funded → Refunded; the whole escrow becomes the
    /// share refund pool, split pro-rata by kg (dust to the treasury). Not blocked by pause so
    /// investors can always be made whole.
    pub fn declare_failure(&mut self, lot_id: TokenId, reason: String, evidence_hash: String) {
        let signer = env::predecessor_account_id();
        require!(
            self.has_role(Role::Coop, &signer) || signer == self.owner_id,
            ERR_NOT_COOP_OR_OWNER
        );
        validate::required_str(&reason);
        let mut lot = self.lot(&lot_id);
        require!(lot.status == Status::Funded, ERR_BAD_STATUS);
        let attestation = new_attestation(
            &lot,
            AttestationKind::CropFailure,
            signer,
            evidence_hash,
            None,
            None,
            Some(reason.clone()),
        );
        push_attestation(&mut lot, attestation);
        let (holder, dust) = holder_split(lot.escrow, lot.sold_kg, &lot.shares);
        lot.holder_pool = lot.escrow;
        lot.claims = Claims {
            holder: U128(holder),
            treasury: U128(dust),
            ..Claims::default()
        };
        lot.settled_at_ms = Some(env::block_timestamp_ms());
        lot.status = Status::Refunded;
        let holder_pool = U128(lot.escrow);
        self.save_lot(lot);

        PratalaEvent::LotRefunded(vec![LotRefunded {
            lot_id,
            reason,
            holder_pool,
        }])
        .emit();
    }
}

impl Contract {
    fn set_price(&mut self, lot_id: TokenId, price_per_kg: U128, from: Status) {
        self.assert_not_paused();
        let mut lot = self.lot(&lot_id);
        self.assert_farmer(&lot);
        require!(lot.status == from, ERR_BAD_STATUS);
        // Shares already sold at the old price cannot be repriced.
        require!(lot.sold_kg == 0, ERR_HAS_SALES);
        require!(price_per_kg.0 > 0, ERR_ZERO_PRICE);
        let total = validate::funding_total(lot.projected_kg, price_per_kg.0);
        lot.price_per_kg = price_per_kg.0;
        lot.status = Status::Listed;
        self.save_lot(lot);
        PratalaEvent::LotListed(vec![LotListed {
            lot_id,
            price_per_kg,
            total: U128(total),
        }])
        .emit();
    }

    pub(crate) fn assert_farmer(&self, lot: &Lot) {
        require!(
            env::predecessor_account_id() == lot.farmer_id,
            ERR_NOT_FARMER
        );
    }

    /// Writes pending `IterableMap` entries now so `storage_usage` reflects them.
    fn flush_lots(&mut self) {
        self.lots.flush();
    }
}

/// Validates the shared attestation fields and builds the record. Verifiers can never attest
/// a lot they farm.
fn new_attestation(
    lot: &Lot,
    kind: AttestationKind,
    signer: AccountId,
    evidence_hash: String,
    evidence_uri: Option<String>,
    ai_check_hash: Option<String>,
    note: Option<String>,
) -> Attestation {
    require!(signer != lot.farmer_id, ERR_SELF_ATTEST);
    validate::hash(&evidence_hash);
    validate::optional_str(&evidence_uri);
    validate::optional_hash(&ai_check_hash);
    validate::optional_str(&note);
    PratalaEvent::LotAttested(vec![LotAttested {
        lot_id: lot.lot_id.clone(),
        kind,
        signer: signer.clone(),
        evidence_hash: evidence_hash.clone(),
        ai_check_hash: ai_check_hash.clone(),
    }])
    .emit();
    Attestation {
        kind,
        signer,
        timestamp_ms: env::block_timestamp_ms(),
        evidence_hash,
        evidence_uri,
        ai_check_hash,
        note,
        actual_kg: None,
        grade: None,
        gps_hash: None,
    }
}

fn push_attestation(lot: &mut Lot, attestation: Attestation) {
    require!(
        lot.attestations.len() < MAX_ATTESTATIONS,
        ERR_TOO_MANY_ATTESTATIONS
    );
    lot.attestations.push(attestation);
}

/// Requires the attached deposit to cover `bytes` of storage and refunds the rest.
fn charge_storage(bytes: u64) {
    let cost = env::storage_byte_cost().saturating_mul(bytes as u128);
    let attached = env::attached_deposit();
    if attached < cost {
        env::panic_str(&format!(
            "{ERR_STORAGE_DEPOSIT}: attach at least {} yoctoNEAR",
            cost.as_yoctonear()
        ));
    }
    let refund = attached.saturating_sub(cost);
    if refund > NearToken::from_yoctonear(0) {
        Promise::new(env::predecessor_account_id())
            .transfer(refund)
            .detach();
    }
}
