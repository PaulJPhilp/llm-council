/**
 * Simple toast notification system
 * Uses a lightweight approach that can be replaced with sonner later
 */

type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
	id: string;
	message: string;
	type: ToastType;
	duration?: number;
}

class ToastManager {
	private toasts: Toast[] = [];
	private listeners: Set<() => void> = new Set();

	subscribe(listener: () => void) {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	getToasts() {
		return [...this.toasts];
	}

	private notify() {
		this.listeners.forEach((listener) => listener());
	}

	show(message: string, type: ToastType = "info", duration = 3000) {
		const id = Math.random().toString(36).substring(7);
		const toast: Toast = { id, message, type, duration };
		this.toasts.push(toast);
		this.notify();

		if (duration > 0) {
			setTimeout(() => {
				this.dismiss(id);
			}, duration);
		}

		return id;
	}

	dismiss(id: string) {
		this.toasts = this.toasts.filter((t) => t.id !== id);
		this.notify();
	}

	success(message: string, duration?: number) {
		return this.show(message, "success", duration);
	}

	error(message: string, duration?: number) {
		return this.show(message, "error", duration || 5000);
	}

	info(message: string, duration?: number) {
		return this.show(message, "info", duration);
	}

	warning(message: string, duration?: number) {
		return this.show(message, "warning", duration);
	}
}

export const toast = new ToastManager();

