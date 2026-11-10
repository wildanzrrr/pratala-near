# **Pratala: Indonesia Web3 Agriculture Platform**

## **Vision and Concept**

Pratala is an agricultural marketplace that connects farmers, fertilizer and seed suppliers, and investors directly, without middlemen. A Web3 layer runs underneath to make transactions transparent and to tokenize harvests as real world assets (RWA).  
Core principle: Web3 works behind the scenes, while farmers only interact through an app as simple as a chat or ordinary e-commerce app.

## **Problems We Solve**

> * Farmers depend on middlemen (tengkulak) and long intermediary chains, which significantly erodes their profit margins.  
> * Access to capital for the planting season is limited because farmers struggle to get formal bank financing.  
> * There is no trustworthy digital record of harvest output, land quality, or transaction history that buyers or investors can rely on.  
> * Fertilizer and seed suppliers find it hard to reach farmers directly and efficiently across many regions.

## **Product Architecture: Web2 in Front, Web3 Behind**

The biggest barrier to Web3 adoption among farmers is the complexity of wallets, private keys, and gas fees. The solution is to hide all of that complexity from the user.  
Farmers log in with just a phone number, like an ordinary chat app. Behind the scenes, the system automatically creates a custodial wallet or uses account abstraction, so farmers never need to know what a private key is or pay gas fees manually.  
The interface they see is very simple: upload photos of their land and harvest, check payment status, and receive sales notifications. All blockchain recording, token verification, and smart contracts run in a backend layer that farmers never see.

## **Harvest Tokenization Flow**

> 1. Land registration and verification: the farmer registers with land photos, GPS coordinates, and land area data, a KYC-style process for farmland. This builds a foundation of trust before any token is issued.  
> 2. Harvest projection token issuance: once planting begins, the system issues a real world asset token representing the projected yield, for example one thousand kilograms of rice to be harvested in a given month.  
> 3. Pre-sale to investors or suppliers: investors or suppliers who want to fund production buy the token in advance, recorded transparently on the blockchain like a pre-order.  
> 4. Harvest verification: when harvest arrives, the yield is verified through photos, local partner reports, or eventually IoT sensors.  
> 5. Token redemption: the token is redeemed for the actual harvest, funds go to the farmer, and the buyer receives the product according to the tokens they hold.

## **Solving the Oracle Problem**

The main challenge of agricultural Web3 is bringing accurate real-world data into a digital system. Pratala uses three layers of verification.  
First, trained field agents or agricultural extension workers visit the land in person and take photos with a dedicated app that automatically records location and time, so the data cannot be forged.  
Second, partnerships with farmer cooperatives or Gapoktan (farmer groups) that the community already trusts and that have their own monitoring structures.  
Third, re-checking quality and quantity at handover at the collection point or warehouse, using scales and a standard grading system before goods are shipped to buyers. With these three layers, no single party determines the truth of the data.

## **Business Model**

| Revenue Source | Description |
| :---- | :---- |
| Transaction fees | 1 to 3% of every sale of fertilizer, seeds, or harvest tokens |
| Verification and certification fees | Paid service for checking land and harvest quality, paid by the farmer or the investor |
| RWA token spread | A small margin on the real world asset token price, since the platform guarantees credibility and liquidity |
| Agricultural data | Sale of aggregated, anonymized data, such as planting patterns and harvest forecasts, to government or agribusiness companies |

## **Stakeholders**

| Party | Role in the Ecosystem |
| :---- | :---- |
| Farmers | Register land, receive upfront funding, sell harvest directly |
| Fertilizer and seed suppliers | Sell farm inputs directly to farmers without middlemen |
| Investors or buyers | Buy harvest projection tokens as early-stage funding |
| Field agents or extension workers | Verify land and harvest in person |
| Farmer cooperatives or Gapoktan | Community monitoring and distribution partners |
| Pratala platform | Provides the marketplace, manages tokens, and guarantees transaction credibility |

## **Development Roadmap**

Phase 1, basic marketplace: build a simple Web2 app that connects farmers directly with fertilizer and seed suppliers, with no blockchain elements yet, to validate the market and build user trust.  
Phase 2, data digitization: add digital land registration, harvest track records, and a network of field agents or partner cooperatives as a trusted data foundation.  
Phase 3, basic Web3 integration: introduce automatic custodial wallets and smart contracts for transactions, starting to record transactions on the blockchain transparently without changing the user experience.  
Phase 4, real world asset tokenization: launch harvest projection tokens that investors or suppliers can buy, complete with verification and redemption mechanisms.  
Phase 5, scale and data: expand to more farming communities, develop agricultural data products, and explore partnerships with government and financial institutions.

## **Challenges and Mitigation**

| Risk | Mitigation |
| :---- | :---- |
| Low adoption due to limited farmer digital literacy | An interface as simple as possible, support from field agents, onboarding through already-trusted cooperatives |
| Field data is forged or inaccurate | Layered verification: field agents, cooperatives, and re-checks at the collection point |
| Crop failure means tokens cannot be redeemed as promised | Integrated crop insurance, diversified investor portfolios, transparent risk disclosure from the first token purchase |
| Web3 and digital asset regulation in Indonesia is still evolving | Legal consultation from the start, beginning with the Web2 phase before tokenization is launched |
| Investor trust in assets that are represented digitally | Third-party audits, transparent reporting, starting small with pilot projects that prove successful |

