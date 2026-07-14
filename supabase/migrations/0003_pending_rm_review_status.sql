-- Add 'pending_rm_review' to 3 ENUM types for RM gate workflow.
-- REQ-CIMB-03-05: Lock/Apply actions now create pending rows awaiting RM confirmation.
ALTER TYPE scheduled_payment_status ADD VALUE IF NOT EXISTS 'pending_rm_review';
ALTER TYPE credit_limit_status ADD VALUE IF NOT EXISTS 'pending_rm_review';
ALTER TYPE product_holding_status ADD VALUE IF NOT EXISTS 'pending_rm_review';
