//! Owner administration and verifier role allowlists.

use near_sdk::store::IterableSet;
use near_sdk::{AccountId, env, near, require};

use crate::errors::*;
use crate::events::{PratalaEvent, RoleChanged};
use crate::types::Role;
use crate::{Contract, ContractExt, MAX_FEE_BPS};

#[near]
impl Contract {
    /// Grants a verifier role. Returns `false` if the account already had it.
    pub fn add_role(&mut self, role: Role, account_id: AccountId) -> bool {
        self.assert_owner();
        let added = self.role_set_mut(role).insert(account_id.clone());
        if added {
            emit_role_changed(role, account_id, true);
        }
        added
    }

    /// Revokes a verifier role. Returns `false` if the account did not have it.
    pub fn remove_role(&mut self, role: Role, account_id: AccountId) -> bool {
        self.assert_owner();
        let removed = self.role_set_mut(role).remove(&account_id);
        if removed {
            emit_role_changed(role, account_id, false);
        }
        removed
    }

    /// Applies to lots funded after the change; funded lots keep their frozen rate.
    pub fn set_fee_bps(&mut self, fee_bps: u16) {
        self.assert_owner();
        require!(fee_bps <= MAX_FEE_BPS, ERR_FEE_TOO_HIGH);
        self.fee_bps = fee_bps;
    }

    pub fn set_treasury(&mut self, account_id: AccountId) {
        self.assert_owner();
        self.treasury = account_id;
    }

    /// Pause blocks new value entering or advancing (register, attest, list, fund, weigh-in).
    /// Claims, cancel, delist, crop-failure refunds and NFT transfers stay open so funds can
    /// always leave.
    pub fn set_paused(&mut self, paused: bool) {
        self.assert_owner();
        self.paused = paused;
    }
}

impl Contract {
    pub(crate) fn assert_owner(&self) {
        require!(
            env::predecessor_account_id() == self.owner_id,
            ERR_NOT_OWNER
        );
    }

    pub(crate) fn assert_not_paused(&self) {
        require!(!self.paused, ERR_PAUSED);
    }

    pub(crate) fn has_role(&self, role: Role, account_id: &AccountId) -> bool {
        match role {
            Role::Admin => account_id == &self.owner_id,
            Role::FieldAgent => self.field_agents.contains(account_id),
            Role::Coop => self.coops.contains(account_id),
            Role::Warehouse => self.warehouses.contains(account_id),
        }
    }

    pub(crate) fn assert_role(&self, role: Role, err: &str) -> AccountId {
        let caller = env::predecessor_account_id();
        if !self.has_role(role, &caller) {
            env::panic_str(err);
        }
        caller
    }

    pub(crate) fn role_set(&self, role: Role) -> Option<&IterableSet<AccountId>> {
        match role {
            Role::Admin => None,
            Role::FieldAgent => Some(&self.field_agents),
            Role::Coop => Some(&self.coops),
            Role::Warehouse => Some(&self.warehouses),
        }
    }

    fn role_set_mut(&mut self, role: Role) -> &mut IterableSet<AccountId> {
        match role {
            Role::Admin => env::panic_str(ERR_ADMIN_ROLE),
            Role::FieldAgent => &mut self.field_agents,
            Role::Coop => &mut self.coops,
            Role::Warehouse => &mut self.warehouses,
        }
    }
}

fn emit_role_changed(role: Role, account_id: AccountId, added: bool) {
    PratalaEvent::RoleChanged(vec![RoleChanged {
        role,
        account_id,
        added,
    }])
    .emit();
}
