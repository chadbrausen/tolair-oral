#!/bin/bash
# Run Prisma migrations against production database
# Usage: DATABASE_URL="postgresql://..." ./deploy/prisma-migrate.sh

set -e

echo "═══ Reveal Oral Health — Database Migration ═══"
echo "Target: ${DATABASE_URL:0:50}..."
echo ""

cd "$(dirname "$0")/../tolair-oral-api"

echo "Running prisma migrate deploy..."
npx prisma migrate deploy

echo ""
echo "Verifying oral_ tables..."
npx prisma db execute --stdin <<SQL
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'oral_%'
ORDER BY table_name;
SQL

echo ""
echo "✅ Migration complete"
echo ""
echo "Next: Run ETL with 'npm run etl:full'"
