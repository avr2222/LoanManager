-- v2_18: Add idempotency guard to claim_payment()
-- Prevents a borrower from claiming an already-claimed/received/waived payment,
-- which previously silently updated confirmed_at to a newer timestamp.

CREATE OR REPLACE FUNCTION public.claim_payment(
  p_payment_id TEXT,
  p_utr_number TEXT DEFAULT ''
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_loan_id        TEXT;
  v_borrower_phone TEXT;
  v_current_status TEXT;
BEGIN
  SELECT loan_id, payment_status
    INTO v_loan_id, v_current_status
    FROM payments
   WHERE id = p_payment_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  IF v_current_status IN ('Claimed', 'Received', 'Waived') THEN
    RAISE EXCEPTION 'Payment is already % — cannot claim again', v_current_status;
  END IF;

  SELECT borrower_phone INTO v_borrower_phone
    FROM loans WHERE loan_id = v_loan_id AND deleted_at IS NULL;

  IF norm_phone(v_borrower_phone) != my_phone() THEN
    RAISE EXCEPTION 'Only the borrower can claim a payment';
  END IF;

  UPDATE payments SET
    payment_status  = 'Claimed',
    amount_received = net_amount_expected,
    confirmed_by    = auth.uid(),
    confirmed_at    = now(),
    remarks         = CASE
                        WHEN p_utr_number != '' THEN 'UTR: ' || p_utr_number
                        ELSE remarks
                      END,
    updated_at      = now()
  WHERE id = p_payment_id;
END;
$$;

ALTER FUNCTION public.claim_payment(TEXT, TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.claim_payment(TEXT, TEXT) TO authenticated;
