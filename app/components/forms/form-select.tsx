"use client";
import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
const EMPTY_OPTION = "__persevex_empty_option__";
export function SelectOption({
  value,
  disabled,
  children,
}: {
  value: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <SelectItem value={value || EMPTY_OPTION} disabled={disabled}>
      {children}
    </SelectItem>
  );
}
// Preserves existing form values, required validation and form.reset behaviour.
export function FormSelect({
  name,
  id,
  value,
  defaultValue = "",
  onChange,
  required,
  disabled,
  children,
  className,
  "aria-label": ariaLabel,
}: {
  name?: string;
  id?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (event: { target: { value: string } }) => void;
  required?: boolean;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  const [localValue, setLocalValue] = useState(defaultValue);
  const trigger = useRef<HTMLButtonElement>(null);
  const controlled = value !== undefined;
  useEffect(() => {
    const form = trigger.current?.closest("form");
    if (!form || controlled) return;
    const reset = () => setLocalValue(defaultValue);
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [controlled, defaultValue]);
  const empty = Children.toArray(children).find(
    (child) =>
      isValidElement<{ value: string; children: ReactNode }>(child) &&
      child.props.value === "",
  );
  const placeholder = isValidElement<{ children: ReactNode }>(empty)
    ? empty.props.children
    : "Select an option";
  return (
    <Select
      name={name}
      value={controlled ? value : localValue}
      required={required}
      disabled={disabled}
      onValueChange={(next) => {
        const actual = next === EMPTY_OPTION ? "" : next;
        if (!controlled) setLocalValue(actual);
        onChange?.({ target: { value: actual } });
      }}
    >
      <SelectTrigger
        ref={trigger}
        id={id}
        aria-label={ariaLabel}
        className={`workspace-select ${className || ""}`}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="workspace-select-menu">
        {children}
      </SelectContent>
    </Select>
  );
}
