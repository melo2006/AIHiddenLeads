import {
  LayoutDashboard, Search, Megaphone, LayoutGrid, FileText, Radar, PhoneIncoming, FolderInput, Monitor, Play, Activity, Image, Brain, Target, MessageSquare, Presentation, ShieldCheck, Video, Wand2, Phone, BarChart3, ChevronLeft, ChevronRight
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { BrandLockup } from "@/components/BrandLogo";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

type NavItem = { title: string; url: string; icon: typeof LayoutDashboard; soon?: boolean };
const navGroups: { label: string; items: NavItem[] }[] = [
  { label: "Overview", items: [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
    { title: "Pipeline", url: "/dashboard/pipeline", icon: LayoutGrid },
  ]},
  { label: "Find leads", items: [
    { title: "Prospects", url: "/dashboard/prospects", icon: Search },
    { title: "Imported Lists", url: "/dashboard/imported", icon: FolderInput },
  ]},
  { label: "Outreach", items: [
    { title: "Campaigns", url: "/dashboard/campaigns", icon: Megaphone },
    { title: "Outreach Report", url: "/dashboard/outreach", icon: Radar },
    { title: "Templates", url: "/dashboard/templates", icon: FileText },
    { title: "SMS Delivery", url: "/dashboard/sms", icon: MessageSquare },
    { title: "AI Follow-Up", url: "/dashboard/follow-up", icon: Brain },
  ]},
  { label: "Results", items: [
    { title: "Campaign Results", url: "/dashboard/campaign-results", icon: Activity },
    { title: "Demo History", url: "/dashboard/sessions", icon: Presentation },
  ]},
  { label: "Voice & avatars", items: [
    { title: "Voice Agents", url: "/dashboard/voice-agents", icon: PhoneIncoming },
    { title: "Voice Usage & Costs", url: "/dashboard/voice-costs", icon: ShieldCheck },
    { title: "Usage Reports", url: "/dashboard/usage-reports", icon: BarChart3 },
    { title: "Customer Setup", url: "/dashboard/wizard-preview", icon: Wand2 },
    { title: "Video Avatars", url: "/dashboard/video-avatars", icon: Video },
    { title: "Phone & SMS", url: "/dashboard/telephony", icon: Phone },
  ]},
];

const marketingItems = [
  { title: "Marketing Hub", url: "/marketing", icon: Image },
  { title: "Ad Creatives", url: "/ad-previews", icon: Play },
];

const pageItems = [
  { title: "Homepage", url: "/", icon: Monitor },
  { title: "Demo Page", url: "/demo", icon: Play },
];

/**
 * Header title for a CRM path, derived from the same nav structure the
 * sidebar renders — the shell header shows the active section + page
 * instead of a second copy of the logo. Exact matches win; detail
 * routes (campaigns/:id, imported/:id) fall back to their parent item.
 */
export function crmTitleForPath(pathname: string): { section: string; title: string } {
  const clean = pathname.replace(/\/+$/, "") || "/dashboard";
  const groups: { label: string; items: NavItem[] }[] = [
    ...navGroups,
    { label: "Marketing", items: marketingItems },
    { label: "Pages", items: pageItems },
  ];
  for (const group of groups) {
    for (const item of group.items) {
      if (item.url === clean) return { section: group.label, title: item.title };
    }
  }
  let best: { section: string; title: string; len: number } | null = null;
  for (const group of groups) {
    for (const item of group.items) {
      if (item.url !== "/dashboard" && clean.startsWith(`${item.url}/`) && (!best || item.url.length > best.len)) {
        best = { section: group.label, title: item.title, len: item.url.length };
      }
    }
  }
  if (best) return { section: best.section, title: best.title };
  if (clean === "/dashboard/intent-leads") return { section: "Find leads", title: "Intent Leads" };
  return { section: "Overview", title: "Dashboard" };
}

export function CRMSidebar() {
  const { state, setOpenMobile, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";

  const handleNavClick = () => {
    setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarContent className="scrollbar-subtle">
        {/* Logo area — the one place the brand lockup appears in the shell */}
        <div className={`flex items-center px-4 py-4 border-b border-border ${collapsed ? "justify-center px-2" : ""}`}>
          <BrandLockup collapsed={collapsed} />
        </div>

        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {!collapsed && group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end={item.url === "/dashboard"}
                        className={item.soon ? "opacity-60 hover:bg-muted/50" : "hover:bg-muted/50"}
                        activeClassName="bg-primary/10 text-primary font-medium"
                        onClick={handleNavClick}
                      >
                        <item.icon className="mr-2 h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {!collapsed && "Marketing"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {marketingItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      className="hover:bg-muted/50"
                      activeClassName="bg-primary/10 text-primary font-medium"
                      onClick={handleNavClick}
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {!collapsed && "Pages"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {pageItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      className="hover:bg-muted/50"
                      activeClassName="bg-primary/10 text-primary font-medium"
                      onClick={handleNavClick}
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Connected APIs status */}
        {!collapsed && (
          <div className="mt-auto px-4 py-4 border-t border-border">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Connected APIs</p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <span className="text-[11px] text-foreground">Firecrawl</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <span className="text-[11px] text-foreground">Google Places</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <span className="text-[11px] text-foreground">Email (Resend)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <span className="text-[11px] text-foreground">SMS (Twilio)</span>
              </div>
            </div>
          </div>
        )}
      </SidebarContent>
      {/* Collapse toggle: a small chevron straddling the sidebar's right
          edge, at the same spot in both states (desktop only — mobile
          uses the header trigger and the sheet's own close). */}
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute right-0 top-6 z-20 hidden h-6 w-6 translate-x-1/2 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:text-foreground md:flex"
      >
        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
      </button>
    </Sidebar>
  );
}
