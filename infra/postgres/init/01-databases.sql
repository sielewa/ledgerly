CREATE USER ledger_svc WITH PASSWORD 'ledger_pw';
CREATE DATABASE ledger OWNER ledger_svc;
-- PUBLIC has default CONNECT for everyone so we block it
REVOKE ALL PRIVILEGES ON DATABASE ledger FROM PUBLIC;

CREATE USER invoice_svc WITH PASSWORD 'invoice_pw';
CREATE DATABASE invoices OWNER invoice_svc;
-- PUBLIC has default CONNECT for everyone so we block it
REVOKE ALL PRIVILEGES ON DATABASE invoices FROM PUBLIC;

CREATE USER payment_svc WITH PASSWORD 'payment_pw';
CREATE DATABASE payments OWNER payment_svc;
-- PUBLIC has default CONNECT for everyone so we block it
REVOKE ALL PRIVILEGES ON DATABASE payments FROM PUBLIC;

CREATE USER notification_svc WITH PASSWORD 'notification_pw';
CREATE DATABASE notifications OWNER notification_svc;
-- PUBLIC has default CONNECT for everyone so we block it
REVOKE ALL PRIVILEGES ON DATABASE notifications FROM PUBLIC;
