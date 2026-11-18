import { Toaster as Sonner, toast } from "sonner";
import { useTheme } from "@/components/ThemeProvider";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ position = "bottom-center", ...props }: ToasterProps) => {
  // Toasts follow the site theme (src/lib/theme.ts), not the OS alone.
  const { resolvedTheme: theme } = useTheme();

  return (
    <Sonner
      position={position}
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
