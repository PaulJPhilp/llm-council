import { useEffect, useState } from "react";
import { toast } from "../lib/toast";
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from "lucide-react";
import { cn } from "../lib/utils";

export function Toaster() {
	const [toasts, setToasts] = useState(toast.getToasts());

	useEffect(() => {
		const unsubscribe = toast.subscribe(() => {
			setToasts(toast.getToasts());
		});

		return unsubscribe;
	}, []);

	if (toasts.length === 0) return null;

	return (
		<div
			className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-md w-full"
			role="region"
			aria-live="polite"
			aria-label="Notifications"
		>
			{toasts.map((t) => {
				const Icon =
					t.type === "success"
						? CheckCircle2
						: t.type === "error"
							? AlertCircle
							: t.type === "warning"
								? AlertTriangle
								: Info;

				return (
					<div
						key={t.id}
						className={cn(
							"flex items-start gap-3 p-4 rounded-lg border shadow-lg bg-background",
							t.type === "error" && "border-destructive",
							t.type === "success" && "border-green-500",
							t.type === "warning" && "border-yellow-500",
							t.type === "info" && "border-primary",
						)}
					>
						<Icon
							className={cn(
								"h-5 w-5 shrink-0 mt-0.5",
								t.type === "error" && "text-destructive",
								t.type === "success" && "text-green-500",
								t.type === "warning" && "text-yellow-500",
								t.type === "info" && "text-primary",
							)}
							aria-hidden="true"
						/>
						<p className="flex-1 text-sm text-foreground">{t.message}</p>
						<button
							type="button"
							onClick={() => toast.dismiss(t.id)}
							className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
							aria-label="Dismiss notification"
						>
							<X className="h-4 w-4" />
						</button>
					</div>
				);
			})}
		</div>
	);
}

