.DEFAULT_GOAL := build

CONTRACTS := pusdc harvest-lot

.PHONY: build build-pusdc build-harvest-lot test unit fmt fmt-check clippy check sizes clean

# Release wasm for every contract -> target/near/<crate_name>/<crate_name>.wasm
build: $(addprefix build-,$(CONTRACTS))

build-%:
	cd contracts/$* && cargo near build non-reproducible-wasm

# Unit + sandbox integration tests (integration tests build both wasm themselves).
test:
	cargo test --workspace

# Unit tests only (no sandbox download, no wasm build).
unit:
	cargo test --workspace --lib

fmt:
	cargo fmt --all

fmt-check:
	cargo fmt --all -- --check

clippy:
	cargo clippy --workspace --all-targets -- -D warnings

# Everything AGENTS.md requires before handoff.
check: fmt-check clippy test build

sizes:
	@ls -l target/near/*/*.wasm

clean:
	cargo clean
