# File Schemas

## Required Frontmatter

Most files require:

```yaml
---
type:
updated_at: YYYY-MM-DD
tags:
---
```

Merchant files also require:

```yaml
merchant_id:
```

## Merchant Profile

```yaml
---
type: merchant_profile
merchant_id:
name:
category:
area:
status:
amc_plan:
tags:
updated_at:
---
```

## Post Example

```yaml
---
type: post_example
platform:
industry:
source_account:
post_url:
collected_at:
tags:
metrics:
  likes:
  saves:
  comments:
---
```

## Tracked Account

```yaml
---
type: tracked_account
platform:
account_name:
account_type:
industry:
region:
tracking_frequency:
tags:
updated_at:
---
```

## Service Plan

```yaml
---
type: service_plan
name:
plan_key:
region:
tags:
updated_at:
---
```

## Generated Outputs

Consumers should read:

```text
generated/knowledge-index.json
generated/merchants/{merchantId}/manifest.json
generated/merchants/{merchantId}/profile.json
generated/merchants/{merchantId}/growth-plan.json
generated/merchants/{merchantId}/presentation.json
generated/merchants/{merchantId}/content-briefs.json
generated/public/merchants/{merchantId}/index.html
```
