//! Read-only views. List views are paginated (default 50, max 100).

use near_contract_standards::non_fungible_token::TokenId;
use near_sdk::json_types::U128;
use near_sdk::{AccountId, env, near};

use crate::errors::ERR_LOT_NOT_FOUND;
use crate::types::{Attestation, Claims, Config, Lot, LotView, Role, Stats, Status};
use crate::validate;
use crate::{Contract, ContractExt};

pub const DEFAULT_LIMIT: u64 = 50;
pub const MAX_LIMIT: u64 = 100;

#[near]
impl Contract {
    pub fn get_lot(&self, lot_id: TokenId) -> Option<LotView> {
        self.lots.get(&lot_id).map(|lot| self.view(lot))
    }

    pub fn get_lots(&self, from_index: Option<u64>, limit: Option<u64>) -> Vec<LotView> {
        self.lots
            .values()
            .skip(from_index.unwrap_or(0) as usize)
            .take(page(limit))
            .map(|lot| self.view(lot))
            .collect()
    }

    /// `from_index` / `limit` apply to the filtered sequence.
    pub fn get_lots_by_status(
        &self,
        status: Status,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<LotView> {
        self.lots
            .values()
            .filter(|lot| lot.status == status)
            .skip(from_index.unwrap_or(0) as usize)
            .take(page(limit))
            .map(|lot| self.view(lot))
            .collect()
    }

    pub fn get_lots_by_farmer(&self, account_id: AccountId) -> Vec<LotView> {
        self.lots
            .values()
            .filter(|lot| lot.farmer_id == account_id)
            .take(MAX_LIMIT as usize)
            .map(|lot| self.view(lot))
            .collect()
    }

    /// Lots whose NFT `account_id` currently owns (NEP-181 enumeration index).
    pub fn get_lots_for_holder(&self, account_id: AccountId) -> Vec<LotView> {
        let Some(token_ids) = self
            .tokens
            .tokens_per_owner
            .as_ref()
            .and_then(|by_owner| by_owner.get(&account_id))
        else {
            return Vec::new();
        };
        token_ids
            .iter()
            .take(MAX_LIMIT as usize)
            .filter_map(|token_id| self.lots.get(&token_id))
            .map(|lot| self.view(lot))
            .collect()
    }

    pub fn get_attestations(&self, lot_id: TokenId) -> Vec<Attestation> {
        self.lot(&lot_id).attestations
    }

    pub fn get_claims(&self, lot_id: TokenId) -> Claims {
        self.lot(&lot_id).claims
    }

    /// `projected_kg × price_per_kg`: the exact amount to send with `ft_transfer_call`.
    pub fn quote_funding(&self, lot_id: TokenId) -> U128 {
        let lot = self
            .lots
            .get(&lot_id)
            .unwrap_or_else(|| env::panic_str(ERR_LOT_NOT_FOUND));
        U128(validate::funding_total(lot.projected_kg, lot.price_per_kg))
    }

    /// `["Admin"]` for the owner, plus every stored role.
    pub fn get_roles(&self, account_id: AccountId) -> Vec<Role> {
        [Role::Admin, Role::FieldAgent, Role::Coop, Role::Warehouse]
            .into_iter()
            .filter(|role| self.has_role(*role, &account_id))
            .collect()
    }

    pub fn list_role(&self, role: Role) -> Vec<AccountId> {
        match self.role_set(role) {
            Some(set) => set.iter().take(MAX_LIMIT as usize).cloned().collect(),
            None => vec![self.owner_id.clone()],
        }
    }

    pub fn get_config(&self) -> Config {
        Config {
            owner_id: self.owner_id.clone(),
            usdc_contract: self.usdc_contract.clone(),
            treasury: self.treasury.clone(),
            fee_bps: self.fee_bps,
            paused: self.paused,
            total_lots: self.lots.len() as u64,
        }
    }

    pub fn get_stats(&self) -> Stats {
        Stats {
            total_lots: self.lots.len() as u64,
            verified_lots: self.counters.verified_lots,
            funded_lots: self.counters.funded_lots,
            settled_lots: self.counters.settled_lots,
            settled_volume: U128(self.counters.settled_volume),
            farmer_paid: U128(self.counters.farmer_paid),
        }
    }
}

impl Contract {
    pub(crate) fn view(&self, lot: &Lot) -> LotView {
        let lot = lot.clone();
        LotView {
            holder: self.holder_of(&lot.lot_id),
            funding_total: U128(validate::funding_total(lot.projected_kg, lot.price_per_kg)),
            lot_id: lot.lot_id,
            farmer_id: lot.farmer_id,
            crop: lot.crop,
            variety: lot.variety,
            region: lot.region,
            projected_kg: lot.projected_kg,
            harvest_month: lot.harvest_month,
            plot_hash: lot.plot_hash,
            gps_hash: lot.gps_hash,
            area_m2: lot.area_m2,
            price_per_kg: U128(lot.price_per_kg),
            status: lot.status,
            attestations: lot.attestations,
            escrow: U128(lot.escrow),
            funder: lot.funder,
            funded_at_ms: lot.funded_at_ms,
            fee_bps: lot.fee_bps,
            actual_kg: lot.actual_kg,
            grade: lot.grade,
            settled_at_ms: lot.settled_at_ms,
            claims: lot.claims,
            claim_lock: lot.claim_lock,
            created_at_ms: lot.created_at_ms,
        }
    }
}

fn page(limit: Option<u64>) -> usize {
    limit.unwrap_or(DEFAULT_LIMIT).min(MAX_LIMIT) as usize
}
