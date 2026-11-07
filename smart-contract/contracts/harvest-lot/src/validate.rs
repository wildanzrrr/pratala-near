//! Input validation. Every caller-supplied string is bounded so storage paid by the contract
//! (verifier attestations) stays bounded per lot.

use near_sdk::{env, require};

use crate::errors::*;

pub const MAX_STR_LEN: usize = 256;

pub fn required_str(value: &str) {
    require!(!value.trim().is_empty(), ERR_STRING_EMPTY);
    require!(value.len() <= MAX_STR_LEN, ERR_STRING_TOO_LONG);
}

pub fn optional_str(value: &Option<String>) {
    if let Some(v) = value {
        require!(v.len() <= MAX_STR_LEN, ERR_STRING_TOO_LONG);
    }
}

/// sha256 hex digest: exactly 64 chars of `[0-9a-f]`.
pub fn is_hash(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

pub fn hash(value: &str) {
    if !is_hash(value) {
        env::panic_str(ERR_BAD_HASH);
    }
}

pub fn optional_hash(value: &Option<String>) {
    if let Some(v) = value {
        hash(v);
    }
}

/// `YYYY-MM` with month 01..=12.
pub fn is_month(value: &str) -> bool {
    let b = value.as_bytes();
    if b.len() != 7 || b[4] != b'-' {
        return false;
    }
    if !b[..4].iter().chain(&b[5..]).all(u8::is_ascii_digit) {
        return false;
    }
    let month = (b[5] - b'0') * 10 + (b[6] - b'0');
    (1..=12).contains(&month)
}

pub fn month(value: &str) {
    if !is_month(value) {
        env::panic_str(ERR_BAD_MONTH);
    }
}

/// `projected_kg × price_per_kg`, rejecting overflow instead of wrapping.
pub fn funding_total(projected_kg: u64, price_per_kg: u128) -> u128 {
    (projected_kg as u128)
        .checked_mul(price_per_kg)
        .unwrap_or_else(|| env::panic_str(ERR_OVERFLOW))
}
