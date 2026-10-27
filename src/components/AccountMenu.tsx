import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { LayoutDashboard, LogOut, Shield, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Header account control: Log in / Create account when signed out, avatar menu when signed in. Admin rights come from the protected platform role table, never client state. */
export default function AccountMenu({ compact = false, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    let active = true;
    void supabase.from("voice_platform_roles").select("role").eq("user_id", user.id).then(({ data }) => {
      if (active) setIsAdmin(Boolean(data?.some((r) => r.role === "admin")));
    });
    return () => { active = false; };
  }, [user?.id]);

  if (!user) {
    return (
      <div className="flex items-center gap-1.5">
        <Button asChild size="sm" variant="ghost" className="h-8 px-2 text-xs sm:text-sm">
          <Link to="/account" onClick={onNavigate}>Log in</Link>
        </Button>
        {!compact && (
          <Button asChild size="sm" variant="outline" className="h-8 text-xs sm:text-sm">
            <Link to="/account?mode=signup" onClick={onNavigate}>Create account</Link>
          </Button>
        )}
      </div>
    );
  }

  const meta = user.user_metadata || {};
  const name: string = meta.full_name || meta.name || user.email || "Account";
  const picture: string | undefined = meta.avatar_url || meta.picture;
  const initials = name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Account menu" className="rounded-full ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Avatar className="h-8 w-8 border border-primary/40">
            {picture && <AvatarImage src={picture} alt="" referrerPolicy="no-referrer" />}
            <AvatarFallback className="bg-primary/15 text-xs font-bold text-primary">{initials || "?"}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[120] w-60">
        <DropdownMenuLabel className="space-y-0.5">
          <p className="truncate text-sm">{name}</p>
          <p className="truncate text-xs font-normal text-muted-foreground">{user.email}</p>
          {isAdmin && <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Admin</p>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isAdmin && (
          <DropdownMenuItem onSelect={() => { onNavigate?.(); navigate("/dashboard"); }}>
            <Shield className="mr-2 h-4 w-4" /> Admin dashboard
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => { onNavigate?.(); navigate("/account"); }}>
          <LayoutDashboard className="mr-2 h-4 w-4" /> My dashboard
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { onNavigate?.(); navigate("/setup"); }}>
          <UserRound className="mr-2 h-4 w-4" /> Business setup
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => { void supabase.auth.signOut(); navigate("/"); }}>
          <LogOut className="mr-2 h-4 w-4" /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
