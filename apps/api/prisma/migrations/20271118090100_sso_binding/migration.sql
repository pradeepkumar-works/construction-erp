-- Single sign-on: the browser tab a sign-in started in (ARCHITECTURE "Single sign-on"). The STATE ticket keeps the
-- hash of the value the sign-in page kept, the CODE ticket copies it, and the exchange takes the code only with it.
ALTER TABLE "SsoTicket" ADD COLUMN "binding" TEXT;
