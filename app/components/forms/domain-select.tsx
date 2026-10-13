"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SALES_DOMAINS } from "../../../shared/domains";

export function DomainSelect({ value, onChange, disabled }: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open && !disabled} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open && !disabled} aria-label="Student domain" aria-required="true" disabled={disabled} className="workspace-select w-full justify-between font-normal">
          <span className="min-w-0 whitespace-normal text-left">{value || "Select domain"}</span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0" style={{ width: "var(--radix-popover-trigger-width)" }}>
        <Command>
          <CommandInput placeholder="Search domains…" aria-label="Search domains" />
          <CommandList className="max-h-60">
            <CommandEmpty>No domains found.</CommandEmpty>
            <CommandGroup>
              {SALES_DOMAINS.map((domain) => (
                <CommandItem key={domain} value={domain} data-checked={value === domain} onSelect={() => { onChange(domain); setOpen(false); }} className="py-2 text-[15px]">
                  {domain}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
