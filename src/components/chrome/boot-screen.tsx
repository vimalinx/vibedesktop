import type { I18nMessages } from "@/lib/i18n";

export function BootScreen({ message }: { message: I18nMessages["app"]["loading"] }) {
  return (
    <div className="boot-screen">
      <span>{message}</span>
    </div>
  );
}
