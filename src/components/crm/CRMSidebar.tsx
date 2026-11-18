import {
  LayoutDashboard, Search, Megaphone, LayoutGrid, FileText, Radar, PhoneIncoming, FolderInput, Monitor, Play, Activity, Image, Brain, Target, MessageSquare, Presentation, ShieldCheck, Video, Wand2, Phone, BarChart3, Users, UserCheck, Building2, Receipt
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
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
    { title: "Page Visitors", url: "/dashboard/page-visitors", icon: Users },
    { title: "Clients", url: "/dashboard/clients", icon: UserCheck },
  ]},
  { label: "Tenants", items: [
    { title: "Tenants", url: "/dashboard/tenants", icon: Building2 },
    { title: "Rate Card", url: "/dashboard/rate-card", icon: Receipt },
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

export function CRMSidebar() {
  const { state, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";

  const handleNavClick = () => {
    setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarContent className="scrollbar-subtle">
        {/* Nav starts at the top: the brand lockup lives in the shell's
            sticky header (CRM.tsx), not here. */}
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
      {/* Collapse/open is owned by the header's SidebarTrigger (CRM.tsx):
          one menu control at every width, so no edge chevron here. */}
    </Sidebar>
  );
}
