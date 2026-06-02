# Heritage Edition Inventory Cost Analysis Model

**Date:** 2026-05-17  
**Author:** John Hope Maglaqui  
**Version:** 1.0  
**Status:** Ready for Implementation

---

## Executive Summary

This document provides a comprehensive framework for calculating the remaining value of existing perfume bottle inventory and creating a cost offset strategy for launching a Heritage Edition collection.

### Key Formulas:

```markdown
Remaining Inventory Value = (Count × Base Cost) - Depreciation Factor
Depreciation Factor = Count × Base Cost × Condition_Percentage
Net Realizable Value = Remaining Inventory Value
Target Recovery Range = Net Realizable Value × 60% to 80%
```

---

## Tab 1: Inventory Audit Sheet

### Template Structure:

| Bottle ID | Size (ml) | Condition | Manufacturing Cost | Depreciation % | Net Value | Notes |
|-----------|-----------|-----------|-------------------|----------------|-----------|-------|
| B001      | 50        | Mint      | ₱85               | 0%             | ₱85.00    | First run, pristine |
| B002      | 30        | Good      | ₱70               | 10%            | ₱63.00    | Minor wear on cap |

### Condition Guidelines:

- **Mint (0% dep):** No scratches, labels intact, no residue inside
- **Good (10% dep):** Minor cosmetic wear, no functional issues
- **Fair (25% dep):** Scratches visible, label may be peeling slightly
- **Poor (50% dep):** Major damage, cracks, no labels, requires resealing

---

## Tab 2: Cost Breakdown Calculator

### Base Manufacturing Costs (Per Empty Bottle):

| Component | 30ml Cost | 50ml Cost | Notes |
|-----------|-----------|-----------|-------|
| Glass/Bottle | ₱40-48 | ₱48-58 | Weight-based pricing |
| Cap Assembly | ₱12-15 | ₱12-15 | Standard closure parts |
| Label Materials | ₱6-8 | ₱8-10 | 3D printed + QR code sticker |
| Filling/Labor | ₱5-7 | ₱5-7 | Labor hours per unit |
| **TOTAL** | **₱63-78** | **₱73-90** | Conservative estimate |

### Adjusted Heritage Costs:

| Component | Standard Cost | Heritage Upgrade | Notes |
|-----------|---------------|------------------|-------|
| Certificate Card | ₱0-3 | ₱4-5 | QR verification + story |
| Authenticity Seal | ₱0-2 | ₱2-3 | UV/holographic sticker |
| Premium Packaging | ₱15-20 | ₱15-20 | Enhanced display materials |
| Story Insert | ₱0-2 | ₱2-3 | Heritage booklet |
| **HERITAGE TOTAL** | - | **+₱21-29** | Add to base cost |

---

## Tab 3: Depreciation Calculator

### Automated Calculation Template:

```markdown
Formula: Net Value = Base Cost × (1 - Depreciation %)

Examples:
- Mint (0%): ₱85 × 1.00 = ₱85.00
- Good (10%): ₱85 × 0.90 = ₱76.50
- Fair (25%): ₱85 × 0.75 = ₱63.75
- Poor (50%): ₱85 × 0.50 = ₱42.50
```

### Batch Calculation Example:

| Condition | Count | Base Cost/Unit | Total Base Cost | Depreciation % | Total Depreciation | Net Value |
|-----------|-------|----------------|-----------------|----------------|--------------------|------------|
| Mint      | 120   | ₱85            | ₱10,200         | 0%             | ₱0                 | ₱10,200    |
| Good      | 50    | ₱85            | ₱4,250          | 10%            | ₱425               | ₱3,825     |
| Fair      | 30    | ₱85            | ₱2,550          | 25%            | ₱637.50            | ₱1,912.50  |
| Poor      | 0     | ₱85            | ₱0              | 50%            | ₱0                 | ₱0         |
| **TOTAL** | **200**| -              | **₱16,900**     | -              | **₱1,062.50**      | **₱15,837.50** |

### Target Recovery Range:

| Scenario | Recovery % | Target Revenue | Profit After Costs* |
|----------|------------|----------------|---------------------|
| Conservative (60%) | 60% | ₱9,502.50 | ₱-₹4,350 (break-even at ₱85/unit)* |
| Target (70%)      | 70% | ₱11,086.25 | ₱+₹1,912.50 profit*
| Aggressive (80%)    | 80% | ₱12,670.00 | ₱+₹4,737.50 profit*

*Note: Profit calculated against base costs only. Refill and new packaging materials are additional operating expenses.

---

## Tab 4: Revenue Tracking Sheet

### Heritage SKU Pricing Matrix:

| SKU | Scent | Regular Price | Heritage Price | Premium | Unit |
|-----|-------|---------------|----------------|---------|------|
| HAZE-HER | Haze (50ml) | ₱420 | ₱490 | +₱70 | 50ml |
| MIST-HER | Mist (50ml) | ₱380 | ₱450 | +₱70 | 50ml |
| AMBER-HER | Amber (30ml) | ₱380 | ₱420 | +₱40 | 30ml |
| STONE-HER | Stone (50ml) | ₱410 | ₱480 | +₱70 | 50ml |

### Revenue Tracking Template:

| Batch ID | SKU | Units Produced | Heritage Units Sold @Premium Price | Regular Units Sold @Retail Price | Total Revenue | Remaining Inventory Value |
|----------|-----|----------------|------------------------------------|----------------------------------|---------------|---------------------------|
| 001      | HAZE-HER | 50 | 30 × ₱490 = ₱14,700 | 20 × ₱420 = ₱8,400 | ₱23,100 | ₱4,250 (10 remaining) |
| 001      | MIST-HER | 50 | 15 × ₱450 = ₱6,750 | 35 × ₱380 = ₱13,300 | ₱20,050 | ₱725 (5 remaining) |

---

## Tab 5: Profit Margin Projections

### Scenario Analysis:

#### Scenario A: Conservative Sell-Through (70% sell rate)

| Metric | Value |
|--------|-------|
| Total Old Bottles Used | 140 units |
| Average Cost Per Bottle (after dep) | ₱68.50 |
| Total Base Manufacturing Cost Recovered | ₱9,590 |
| Refill Costs (P/mL × quantity) | ₱XX,XXX |
| New Labels & Packaging Materials | ₱2,100-2,800 |
| Certificates & Seals | ₱650-950 |
| **Total COGS** | **₱(XX,XXX)** |
| **Revenue (70% premium pricing)** | **₱XX,XXX** |
| **Gross Profit** | **₱(XX,XXX)** |
| Gross Margin % | **XX%** |

#### Scenario B: Target Sell-Through (85% sell rate)

| Metric | Value |
|--------|-------|
| Total Old Bottles Used | 170 units |
| Average Cost Per Bottle (after dep) | ₱68.50 |
| Total Base Manufacturing Cost Recovered | ₱11,645 |
| Refill Costs | - |
| New Labels & Packaging Materials | ₱2,550-3,400 |
| Certificates & Seals | ₱780-1,140 |
| **Total COGS** | **-|
| Revenue (85% premium pricing) | ₱XX,XXX |
| Gross Profit | ₱(XX,XXX) |
| Gross Margin % | XX%

#### Scenario C: Optimistic Sell-Through (95% sell rate)

| Metric | Value |
|--------|-------|
| Total Old Bottles Used | 190 units |
| Average Cost Per Bottle (after dep) | ₱68.50 |
| Total Base Manufacturing Cost Recovered | ₱13,015 |
| Refill Costs | - |
| New Labels & Packaging Materials | ₱2,850-3,800 |
| Certificates & Seals | ₱870-1,300 |
| **Total COGS** | **₱(XX,XXX)** |
| Revenue (90% premium pricing) | ₱XX,XXX |
| Gross Profit | ₱(XX,XXX) |
| Gross Margin % | XX%

---

## Break-Even Analysis

### Formula: Break-Even Units = Total Costs / Average Selling Price

#### Example Calculation (50ml bottles):

**Assumptions:**
- 100 old bottles at fair condition (₱85 base cost)
- Net realizable value after depreciation: ₱63.75/bottle
- Total inventory value: ₱6,375
- Target recovery (70%): ₱4,462.50

**Operating Costs:**
- Refill oil: 18g × ₱₳/ml = ₱XX per bottle
- New heritage labels: ₱8-10/bottle
- Certificate cards: ₱4-5/bottle
- Authenticity seals: ₱2-3/bottle
- Premium packaging: ₱15-20/bottle
- Total per-unit operating cost: ₱₳XX

**Selling Price:**
- Heritage premium price: ₱490 (70% above cost basis)

**Break-Even Point:**
- If refill costs are ₱25/g and we use 18g: ₱450/refill
- Total COGS per unit = ₱63.75 + ₱450 = ₱513.75 (old bottles) OR ₱90+₱450=₱540 (new bottles)
- Break-even units needed to cover all costs: XX units
- Timeframe to break-even: XX weeks at current sales velocity

---

## Key Performance Indicators (KPIs)

### Inventory Metrics:
- **Depletion Rate:** % of old bottles used per week
- **Sell-Through Rate:** Units sold vs. units produced
- **Remaining Inventory Value:** P value of unsold heritage stock
- **Cost Recovery Ratio:** Actual recovery ÷ Target recovery

### Financial Metrics:
- **Gross Margin by SKU:** Revenue - COGS ÷ Revenue
- **Average Order Value (AOV):** Total revenue ÷ Number of orders
- **Customer Acquisition Cost (CAC) by Channel:** Ad spend ÷ New customers

### Brand Impact Metrics:
- **Social Sentiment Score:** Positive mentions ÷ Total mentions
- **Sustainability Mention Rate:** % posts referencing heritage/sustainability
- **Email Conversion Rate:** Email subscribers from campaign

---

## Risk Assessment Matrix

| Risk | Probability (1-5) | Impact (1-5) | Weighted Score (P×I) | Mitigation |
|------|------------------|--------------|---------------------|------------|
| Customer backlash at premium pricing | 3 | 4 | 12 | Emphasize exclusivity; offer trade-in program for repeat purchases |
| Damaged bottles in shipment | 3 | 3 | 9 | Enhanced packaging SOPs; insurance on heritage shipments |
| Slower sell-through than expected | 4 | 3 | 12 | Create bundle deals after 45 days; limited-time discount max 10% |
| Quality complaints about old bottles | 2 | 4 | 8 | Rigorous QC checklist; batch testing before filling |
| Inventory spoilage (perfume expiration) | 2 | 5 | 10 | Track production dates; sell clearance first at reduced price |

---

## Implementation Recommendations

### Week 1 Actions:
- [ ] Complete physical inventory count and condition assessment
- [ ] Populate cost analysis spreadsheet with actual data
- [ ] Set up tracking dashboard for sales velocity
- [ ] Prepare refill materials order list

### Week 2 Actions:
- [ ] Source refill oils and confirm supplier lead times
- [ ] Order certificates, seals, and premium packaging materials
- [ ] Test label designs on sample bottles
- [ ] Finalize quality control checklist

### Week 3 Actions:
- [ ] Begin refilling process for first heritage batch (Batch #001)
- [ ] Set up production area with enhanced lighting/inspections
- [ ] Document process for social media content (behind-the-scenes)

### Week 4 Actions:
- [ ] Complete Batch #001 packaging and quality checks
- [ ] Launch heritage collection on website
- [ ] Execute influencer seeding (send to micro-influencers)
- [ ] Monitor sales velocity daily

---

## Cost Offset Summary Report Template

### Monthly Summary:

| Month | Old Bottles Used | Revenue Generated | Costs Incurred | Net Profit/Loss | Inventory Value Recovered |
|-------|------------------|-------------------|----------------|-----------------|---------------------------|
| Jan    | XX                | PXX,XXX           | PXX,XXX        | P(XX,XXX)      | 60%                      |
| Feb    | XX                | PXX,XXX           | PXX,XXX        | P(XX,XXX)      | 75%                      |
| Mar    | XX                | PXX,XXX           | PXX,XXX        | P(XX,XXX)      | 90%                      |

---

**End of Cost Analysis Model**

*Next: Create Heritage Edition Product Specifications (Task 2)*
