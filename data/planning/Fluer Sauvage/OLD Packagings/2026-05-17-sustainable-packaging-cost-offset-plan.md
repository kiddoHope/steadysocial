# Sustainable Packaging Cost Offset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a phased strategy to incorporate existing inventory of perfume bottles into new product batches while recovering costs and aligning with sustainability positioning.

**Architecture:** 
- Phase 1: Calculate remaining inventory value and create cost offset model
- Phase 2: Implement limited batch production using old bottles
- Phase 3: Develop "heritage edition" marketing to justify premium pricing
- Phase 4: Transition to sustainable packaging while maintaining profitability

**Tech Stack:** 
- Inventory management (spreadsheet)
- Cost accounting formulas
- Marketing positioning framework
- Sustainability certification options

---

## File Structure

Before defining tasks, map out which files will be created or modified:

### To Create:
- `docs/superpowers/plans/cost-analysis-model.md` - Detailed cost calculation sheet
- `docs/superpowers/plans/heritage-edition-spec.md` - Marketing product spec
- `docs/superpowers/plans/sustainability-transition-roadmap.md` - Long-term path
- `marketing/sustainable-packaging-campaign.md` - Campaign copy assets

### To Modify:
- Existing pricing models in current product docs
- Inventory records for old bottle tracking

---

## Task 1: Inventory Cost Analysis & Valuation Model

**Files:**
- Create: `docs/superpowers/plans/cost-analysis-model.md`
- Modify: Current inventory tracking spreadsheet

- [ ] **Step 1.1: Audit existing bottle inventory**

```markdown
## Action Items:
1. Count total bottles in storage (boxes + loose)
2. Record bottle type/sizes (30ml, 50ml)
3. Check condition (scratches, labels intact)
4. Estimate remaining manufacturing cost per bottle:
   - Glass/weight: ₱40-60
   - Cap assembly: ₱15-25
   - Label materials: ₱8-12
   - Filling/closure labor: ₱5-8
   - **Total COGS per empty bottle: ₱68-105**
```

- [ ] **Step 1.2: Create cost offset calculation template**

```markdown
## Cost Offset Calculator

### Formula Structure:
```
Remaining Inventory Value = 
  (Number of Bottles × Average Manufacturing Cost) - Depreciation Factor

Depreciation Factor by Condition:
- Mint (no damage, labels intact): 0% depreciation
- Good (minor wear): 10% depreciation
- Fair (scratches, no label): 25% depreciation
- Poor (major damage): 50% depreciation
```

### Example Calculation:
```
Scenario: 200 bottles in fair condition
- Base cost: 200 × ₱85 = ₱17,000
- Depreciation: -₱4,250 (25%)
- Remaining value: ₱12,750

Target recovery: ₱10,000-15,000 (60-80% of value)
```

**Deliverable:** Complete spreadsheet with tabs:
- Inventory count
- Cost per bottle breakdown
- Depreciation calculator
- Target revenue tracking
- Profit margin projection

---

## Task 2: Heritage Edition Product Development

**Files:**
- Create: `docs/superpowers/plans/heritage-edition-spec.md`
- Create: `marketing/product-specs/heritage-bottles.md`

- [ ] **Step 2.1: Define heritage product specifications**

```markdown
## Heritage Collection Product Spec

### Product Positioning:
- **Name:** "Vintage Reserve" or "Heritage Edition"
- **Narrative:** Limited-time opportunity to own original bottles from the founder's first production run
- **Price Premium Strategy:** 
  - Base price: ₱20-35 above standard retail
  - Justification: Sustainability story + exclusivity + rarity
  - Margin impact: Additional revenue directly covers bottle costs

### Packaging Specifications:
```

#### Authenticity Markers:
1. **Certificate of Origin Card**
   - QR code linking to blockchain verification
   - Batch number and "first production run" designation
   - Limited edition numbering (e.g., "/250")

2. **Story Insert**
   - Founding vision and sustainability mission
   - Bottle journey from first batch to your collection
   - Care instructions for vintage bottles

3. **Authenticity Seal**
   - UV-reactive sticker on bottle cap
   - Holographic heritage badge on box interior

4. **Modular Reusable Packaging**
   - 3D-printed display stand (reversible)
   - "Plant this after use" seed paper sleeve option

### Scent Variants:
- Launch with top 2 best-sellers first
- Offer custom blend option for heritage collectors (+₱150)
```

- [ ] **Step 2.2: Create pricing model**

```markdown
## Heritage Edition Pricing Structure

### Example SKU Matrix:
| Scent | Regular Price | Heritage Price | Cost Offset |
|-------|--------------|----------------|-------------|
| Haze (50ml) | ₱420 | ₱490 (+₱70) | Covers ₱85 + ₱35 profit |
| Mist (50ml) | ₱380 | ₱450 (+₱70) | Covers ₱85 + ₱35 profit |
| Amber (30ml) | ₱380 | ₱420 (+₱40) | Covers ₱68 + ₱28 profit |
| Stone (50ml) | ₱410 | ₱480 (+₱70) | Covers ₱85 + ₱35 profit |

### Margin Analysis:
- Standard margin: 40-50%
- Heritage margin: 60-70% (premium pricing)
- Cost recovery rate: 100% within first 25-30 units sold
```

---

## Task 3: Limited Batch Production Run

**Files:**
- Create: `production/batch-log/heritage-run-001.md`
- Modify: Existing production pipeline documentation

- [ ] **Step 3.1: Plan batch allocation**

```markdown
## First Heritage Run Allocation:

### Inventory Utilization Plan:
| Condition | Bottle Count | Priority Use Case |
|-----------|-------------|-------------------|
| Mint | 60% (120 units) | Full heritage SKUs |
| Good | 25% (50 units) | Standard + heritage bundle |
| Fair | 15% (30 units) | Clearance bundles |

### Production Run Targets:
- Batch #001: 150 units (test market response)
- Production timeline: 7-10 days for refill + labeling
- Expected cost recovery: ₱8,000-12,000
```

- [ ] **Step 3.2: Create refill SOP**

```markdown
## Standard Operating Procedure: Heritage Batch Refilling

### Prerequisites:
✓ Bottles cleaned and dried (72h minimum)
✓ Quality inspection passed
✓ Authenticity markers prepared
✓ Labels tested on sample batch

### Step-by-Step Process:

1. **Quality Check**
   - Inspect each bottle for cracks/crystals
   - Remove damaged bottles from heritage line
   - Document in batch log (attach photos)

2. **Label Preparation**
   - Apply "Vintage Reserve" label (distinct from regular)
   - Affix authenticity seal if applicable
   - Note production date and batch number

3. **Filling Station**
   - Weigh bottle before fill (baseline: 0g)
   - Target fill weight: 18g for 50ml, 12g for 30ml
   - Record any variances >±1g for QA review

4. **Capping & Quality Control**
   - Cap at specified torque
   - Final visual inspection
   - Apply batch QR code

5. **Documentation**
   - Update inventory sheet (bottles → sold/unsold)
   - Record in production log
   - Prepare shipping manifest
```

- [ ] **Step 3.3: Quality control checklist**

```markdown
## Heritage Batch QC Checklist:

### Pre-Fill Inspection:
- [ ] No cracks or chips visible
- [ ] No mineral deposits inside bottle
- [ ] Cap threads undamaged
- [ ] Label application surface clean

### Post-Fill Verification:
- [ ] Fill weight within ±1g tolerance
- [ ] Leak test complete (30min hold)
- [ ] Spillage-free capping station
- [ ] Barcode/QR scanable

### Batch Acceptance Criteria:
- Pass rate: ≥95%
- Damaged bottle quarantine: <3%
- Customer complaints target: 0.5% or less
```

---

## Task 4: Marketing Campaign Development

**Files:**
- Create: `marketing/sustainable-packaging-campaign.md`
- Create: `marketing/copy/heritage-edition-launch-copy.md`
- Create: `marketing/social-content/vintage-storyline.md`

- [ ] **Step 4.1: Craft sustainability narrative**

```markdown
## Heritage Campaign Core Message:

### Primary Hook:
"Own a piece of our origin story while championing sustainable luxury"

### Supporting Pillars:
1. **Sustainability First:**
   - "Every bottle in our first collection is now part of your daily ritual"
   - Reduce waste by keeping existing inventory alive
   - Model circular economy practices

2. **Exclusivity:**
   - Limited quantities due to intentional inventory management
   - Cannot be replicated (first run bottles)
   - Authenticity guarantee with QR verification

3. **Value Proposition:**
   - Premium pricing justified by:
     * Sustainability leadership (+10%)
     * Exclusive heritage status (+15%)
     * Quality craftsmanship maintained (+10%)
   - Total premium: 35% over regular retail (customers expect for limited editions)

### Social Media Cadence:
- Instagram Story daily during launch week
- Reels: bottle transformation journey, customer testimonials
- Posts: educational content about circular fashion in beauty
```

- [ ] **Step 4.2: Create email campaign sequence**

```markdown
## Email Launch Sequence:

### Day -7 (Teaser):
Subject: "Something vintage is brewing..."
Body: Blurred images, mystery tease about sustainability story

### Day -2 (Story):
Subject: "The bottles that started it all"
Body: Behind-the-scenes photos from original production run, mission statement

### Day 0 (Launch):
Subject: "Vintage Reserve drops today — limited availability"
Body: Hero product shots, QR code story link, early bird offer

### Day +3 (Storytelling):
Subject: "Meet the bottles behind your scent"
Body: Customer testimonials, impact metrics (e.g., "120 less wasted")

### Day +7 (Scarcity):
Subject: "Only 85 Heritage bottles remaining"
Body: Exact quantity left count, urgency messaging
```

- [ ] **Step 4.3: Develop influencer seeding strategy**

```markdown
## Micro-Influencer Seeding Plan:

### Target Profiles:
- Beauty enthusiasts focused on sustainability (₱2k-5k/influencer)
- Perfume collectors with appreciation for exclusivity (₱1k-3k/influencer)
- Local Manila lifestyle creators (₱3k-7k/influencer)

### Gifting Package Contents:
- 1 Heritage bottle (30ml or 50ml based on preference)
- Certificate of authenticity
- "Plantable" packaging insert
- Story booklet with QR codes

### Content Requirements:
- Unboxing video/story showing certificate activation
- Story mentioning sustainability angle
- Feed post tagging @FluerSauvage within 48h
```

---

## Task 5: Distribution & Logistics Optimization

**Files:**
- Create: `operations/logistics/heritage-shipping-sop.md`
- Modify: Existing shipping templates and tracking sheets

- [ ] **Step 5.1: Create secure packaging for vintage bottles**

```markdown
## Heritage Shipping Specifications:

### Primary Packaging Materials:
- Bubble wrap (2 layers minimum)
- Corner protectors for glass
- "Handle with care" labels (eco-certified tape)

### Box Selection:
- Slightly larger than product to avoid tight fit
- Fill void space with recycled paper packing peanuts
- Include authenticity materials in center of box

### Shipping Label Design:
- QR code for tracking + story page
- Special "First Collection" sticker
- Return instructions for damaged shipments

### Insurance Coverage:
- ₱2,500 per shipment (heritage SKUs)
- Documentation required for claims (photos + certificate)

### Cost Optimization:
- Bulk tape/packing material order: 15% savings
- Priority shipping lanes only (reduce transit time = less damage risk)
```

---

## Task 6: Transition to Future Packaging

**Files:**
- Create: `docs/superpowers/plans/sustainability-transition-roadmap.md`
- Modify: Long-term strategic documents

- [ ] **Step 6.1: Phase out old bottle inventory**

```markdown
## Bottle Transition Timeline:

### Month 1-3 (Current): Heritage Collection
- Use remaining old bottles exclusively
- Full marketing push on sustainability story
- Target: Sell 70% of current inventory

### Month 4-6: Hybrid Phase
- 50% new bottles / 50% old bottles
- Mark new stock clearly as "Standard" or "Modern Collection"
- Heritage collection discontinued after old stock depleted

### Month 7-9: Complete Transition
- All new production uses sustainable materials
- 3D printed packaging continues (modular design)
- Consider biodegradable or compostable options

### Month 10+: Sustainability Certification
- Apply for FSC certification if using wood/plastics from certified sources
- Consider CarbonNeutral® program offsetting
- Publish annual sustainability report to customers
```

---

## Task 7: Financial Projection & KPI Tracking

**Files:**
- Create: `financials/heritage-run-projections.md`
- Create: `analytics/dashboard/sustainability-metrics-dashboard.md`

- [ ] **Step 7.1: Build P&L model for heritage collection**

```markdown
## Heritage Run Profitability Model:

### Revenue Projections (Batch #001 - 150 units):
```

| SKU | Units Sold @ Regular Price | Units Sold @ Heritage Price |
|-----|---------------------------|-----------------------------|
| Haze 50ml | 60 × ₱420 = ₱25,200 | 30 × ₱490 = ₱14,700 |
| Mist 50ml | 50 × ₱380 = ₱19,000 | 15 × ₱450 = ₱6,750 |
| Amber 30ml | 20 × ₱380 = ₱7,600 | 10 × ₱420 = ₱4,200 |
| Stone 50ml | 30 × ₱410 = ₱12,300 | 15 × ₱480 = ₱7,200 |
| **Total Revenue** | - | - |

### Cost Structure:
```
Manufacturing Costs (using old bottles):
- Refill costs: 135g × ₱₳/ml × 150 units = ₱XX,XXX
- New labels: 150 × ₱8-12 = ₱1,200-1,800
- Certificate cards: 150 × ₱3-5 = ₱450-750
- Authenticity seals: 150 × ₱2-4 = ₱300-600
- Packaging materials: 150 units total
- **Total COGS: ₱XX,XXX (includes refill + new packaging)**

### Profit Projection:
```
- Revenue: ₱67,050 (regular price sales) + ₱32,850 (heritage premium) = ₱99,900
- COGS: ₱XX,XXX
- Gross Margin: ₱(₹₉9,900 - XX,XXX)
- Bottle cost already depreciated: Recovered 100% of ₱68-85 per unit
```

### Break-even Analysis:
- Target revenue needed: ₱XX,XXX (covers all costs)
- Units to break even: ~XX units
- Expected sell-through: 90%+ within first 3 months

---

## Analytics Dashboard Requirements:

### Key Metrics to Track:
1. Inventory depletion rate (% old bottles used weekly)
2. Heritage collection sales velocity (units/week)
3. Customer acquisition cost by channel (heritage vs standard)
4. Repeat purchase rate from heritage buyers
5. Social sentiment around sustainability angle
6. Return rate comparison (heritage vs regular)

### Data Sources:
- Shopify analytics backend
- Google Analytics 4 custom events
- Email marketing platform metrics
- Social listening tools (brand mentions, hashtags)
```

---

## Risk Mitigation & Contingencies

| Risk | Probability | Impact | Mitigation Strategy |
|------|-------------|--------|---------------------|
| Customer backlash at premium pricing | Medium | High | Emphasize sustainability story + exclusivity; offer trade-in program for future purchases |
| Damaged bottles in shipment | Low-Medium | Medium | Enhanced packaging SOPs; insurance on all heritage shipments |
| Slower sell-through than expected | Medium | Medium | Create bundle deals with other products; limited-time discount (max 10% off) after 45 days |
| Quality complaints about old bottles | Low | High | Rigorous QC checklist; batch testing for bottle condition before filling |
| Inventory spoilage (if perfume expires) | Low | Critical | Track production dates; sell clearance at reduced price first |

---

## Execution Checklist

### Week 1: Analysis & Planning
- [ ] Complete inventory audit and valuation
- [ ] Create cost analysis spreadsheet
- [ ] Finalize heritage product specifications
- [ ] Set up tracking dashboard

### Week 2: Product Preparation
- [ ] Source refill materials
- [ ] Order certificates/seals/packaging
- [ ] Test label designs on sample bottles
- [ ] QC inspection protocol finalized

### Week 3: Marketing Setup
- [ ] Create email campaign drafts
- [ ] Design social assets
- [ ] Seed inventory to influencers
- [ ] Set up tracking UTM codes

### Week 4: Production Launch
- [ ] Begin filling and labeling first heritage batch
- [ ] Execute influencer seeding
- [ ] Launch website product pages
- [ ] Send email sequence (Day -7 → Day 0)

### Post-Launch (Weeks 5-12):
- [ ] Monitor sell-through rate weekly
- [ ] Adjust marketing spend based on channel performance
- [ ] Collect and respond to customer reviews
- [ ] Plan transition to new bottles (Month 4+)

---

## Success Criteria Definition

### Short-term (3 months):
- ✅ Sell 75%+ of heritage batch inventory
- ✅ Achieve 60%+ gross margin on heritage SKUs
- ✅ Positive customer sentiment in reviews/social mentions
- ✅ Documented process for cost offset completion

### Long-term (6 months):
- ✅ Complete transition from old bottles to new sustainable stock
- ✅ Establish repeat purchase rate >35% within first 90 days of purchase
- ✅ Achieve 1k+ email subscribers through heritage campaign
- ✅ Publish sustainability impact report to customers

---

**End of Plan**

*Next steps: Execute Task 1 (Cost Analysis) → subagent or inline execution choice.*
