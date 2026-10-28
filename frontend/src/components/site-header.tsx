"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";

const links = [
  { href: "/#approach", label: "The approach" },
  { href: "/#workflow", label: "How it works" },
  { href: "/#research", label: "Research" },
  { href: "/analyze", label: "Analyze" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <header className="site-header">
      <div className="container header-inner">
        <a href="/" aria-label="GAZE home" onClick={() => setOpen(false)}><Brand /></a>
        <nav className="desktop-nav" aria-label="Main navigation">
          {links.map((link) => <a key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined}>{link.label}</a>)}
        </nav>
        <Button variant="outline" asChild className="header-project">
          <a href="https://github.com/emperuna/gaze-cv" target="_blank" rel="noreferrer">View project <ArrowUpRight /></a>
        </Button>
        <Button variant="ghost" size="icon" className="menu-toggle" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpen(!open)}>
          {open ? <X /> : <Menu />}
        </Button>
      </div>
      {open && (
        <nav id="mobile-navigation" className="mobile-nav container" aria-label="Mobile navigation">
          {links.map((link) => <a key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined} onClick={() => setOpen(false)}>{link.label}</a>)}
          <a href="https://github.com/emperuna/gaze-cv" target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>View project <ArrowUpRight size={16} /></a>
        </nav>
      )}
    </header>
  );
}
