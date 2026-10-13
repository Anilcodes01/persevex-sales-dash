"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function SearchableSelect({
  value,
  onChange,
  options,
  label,
  allLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  label: string;
  allLabel: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={label}
          className="workspace-select w-full justify-between font-normal"
        >
          <span className="truncate">
            {options.find((option) => option.value === value)?.label ||
              allLabel}
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="p-0"
        style={{ width: "var(--radix-popover-trigger-width)" }}
      >
        <Command>
          <CommandInput
            placeholder={`Search ${label.toLowerCase()}…`}
            aria-label={`Search ${label.toLowerCase()}`}
          />
          <CommandList className="max-h-60">
            <CommandEmpty>No matches found.</CommandEmpty>
            <CommandGroup>
              {[{ value: "", label: allLabel }, ...options].map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value || "__all__"}
                  keywords={[option.label]}
                  data-checked={value === option.value}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className="py-2 text-[15px]"
                >
                  <span className="min-w-0 break-words">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
