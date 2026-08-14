"use client";

// ============================================================
// /account-disabled
//
// Landing spot for a member whose access was turned off via
// Settings → Members (migration 039, `set_member_active`). They
// still have a valid login — this page is reached via a
// middleware redirect, not a failed sign-in — but every protected
// route bounces them back here until an admin re-enables them.
// ============================================================

import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

export default function AccountDisabledPage() {
  const { signOut } = useAuth();

return (
  <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
  <ShieldOff className="size-10 text-muted-foreground" />
  <h1 className="text-lg font-semibold text-foreground">
  Seu acesso foi desativado
  </h1>
  <p className="max-w-sm text-sm text-muted-foreground">
  Um administrador desativou seu acesso a esta conta. Fale com ele para
  reativar, ou entre com outra conta.
  </p>
  <Button onClick={() => void signOut()} variant="outline">
  Sair
  </Button>
  </div>
  );
}
