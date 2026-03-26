-- Fix marketplace stores visibility for all authenticated users
-- This reverts a restrictive policy that hid stores from specific roles like uz_manager.

DROP POLICY IF EXISTS "Managers can view marketplace stores" ON marketplace_stores;
CREATE POLICY "Managers can view marketplace stores"
  ON marketplace_stores FOR SELECT TO authenticated
  USING (true);

-- Fix marketplace listings visibility
DROP POLICY IF EXISTS "Managers can manage listings" ON marketplace_listings;
CREATE POLICY "Managers can manage listings"
  ON marketplace_listings FOR ALL TO authenticated
  USING (true);

-- Fix marketplace orders visibility
DROP POLICY IF EXISTS "Managers can manage orders" ON marketplace_orders;
CREATE POLICY "Managers can manage orders"
  ON marketplace_orders FOR ALL TO authenticated
  USING (true);
