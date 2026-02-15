import { cn } from "@/lib/utils";

type StatusType = "success" | "warning" | "error" | "pending" | "approved" | "flagged" | "healthy" | "moderate" | "executed" | "skipped";

const statusStyles: Record<StatusType, string> = {
  success: "status-success",
  warning: "status-warning",
  error: "status-error",
  pending: "status-pending",
  approved: "status-success",
  flagged: "status-error",
  healthy: "status-success",
  moderate: "status-warning",
  executed: "status-success",
  skipped: "status-pending",
};

const StatusBadge = ({ status, className }: { status: StatusType; className?: string }) => (
  <span className={cn(statusStyles[status], className)}>{status}</span>
);

export default StatusBadge;
