-- Load directly from PG to TS
INSTALL postgres;
LOAD postgres;

ATTACH 'dbname=timescaledb user=user password=password host=127.0.0.1 port=5433' AS timescaledb (TYPE postgres, SCHEMA 'public');
ATTACH 'dbname=mydb user=user password=password host=127.0.0.1 port=5432' AS pgdb (TYPE postgres, SCHEMA 'public');
CALL postgres_execute('timescaledb', 'drop table if exists taxidata;');
CREATE TABLE timescaledb.public.taxidata AS
SELECT * FROM pgdb.public.taxidata;
