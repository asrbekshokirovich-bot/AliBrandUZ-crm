---
description: Manage user roles and permissions in the CRM system
---

# /auth — Authentication & Role Management Workflow

Manage user roles, permissions, and RLS policies in alicargo-joy-main.

## Role System

| Role | Uzbek Name | Permissions |
|---|---|---|
| `bosh_admin` | Bosh Admin | Full access to everything |
| `rahbar` | Rahbar (CEO) | Read all, approve operations |
| `xitoy_manager` | Xitoy Manager | China warehouse + shipping |
| `xitoy_packer` | Xitoy Packer | Pack boxes, scan items |
| `uz_manager` | UZ Manager | Tashkent warehouse management |
| `uz_staff` | UZ Xodim | Tashkent warehouse operations |

## Check a User's Current Role
```sql
-- In Supabase SQL Editor
SELECT u.email, ur.role 
FROM auth.users u
JOIN user_roles ur ON ur.user_id = u.id
WHERE u.email = 'user@example.com';
```

## Add/Change User Role
```sql
-- Add role to user
INSERT INTO user_roles (user_id, role)
SELECT id, 'uz_manager'::app_role
FROM auth.users WHERE email = 'newmanager@example.com';

-- Change role
UPDATE user_roles SET role = 'uz_staff'
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'user@example.com');
```

## Using Roles in React Components
```typescript
import { useUserRole } from '@/hooks/useUserRole';

const { isChiefManager, isUzManager, isUzStaff, isChina, roleLoading } = useUserRole();

// Guard UI sections
{isChiefManager && <AdminPanel />}
{(isUzManager || isChiefManager) && <EditButton />}
```

## RLS Policy Pattern
```sql
-- Allow role-based access
CREATE POLICY "managers can update boxes"
  ON public.boxes FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'rahbar'::app_role) OR
    has_role(auth.uid(), 'bosh_admin'::app_role) OR
    has_role(auth.uid(), 'xitoy_manager'::app_role)
  );
```

## Supabase Auth Hooks
```typescript
// Check auth state
const { data: { user } } = await supabase.auth.getUser();
if (!user) redirect('/auth');

// Listen for auth changes
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') navigate('/auth');
});
```

## Usage
```
/auth "add new staff member with uz_staff role"
/auth "restrict boxes deletion to admins only"
/auth "debug why user can't access CRM"
```
