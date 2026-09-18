import {
  AlarmClock,
  BarChart3,
  BellRing,
  CheckCircle2,
  CircleAlert,
  FileCheck2,
  ListChecks,
  RefreshCw,
	Send,
	ShieldAlert,
  UserPlus,
  UserRoundCheck,
  Users,
  XCircle
} from "lucide-react";
import type { NotificationResponse } from "../../types";

export type NotificationTone = "info" | "success" | "warning" | "danger" | "invitation";

export function notificationPresentation(notification: NotificationResponse) {
  const type = notification.type;
	if (type === "support_access_requested") return { tone: "warning" as const, label: "Запрос администратора", icon: ShieldAlert };
	if (type === "support_access_decided") return { tone: "info" as const, label: "Доступ поддержки", icon: ShieldAlert };
	if (type === "action_external_sync_requested") return { tone: "warning" as const, label: "Согласование Bitrix24", icon: Send };
	if (type === "action_external_sync_decided") return { tone: "success" as const, label: "Отправка в Bitrix24", icon: Send };
  if (type === "scorecard_failed") return { tone: "danger" as const, label: "Критерии не готовы", icon: CircleAlert };
  if (type === "scorecard_review_needed") return { tone: "warning" as const, label: "Проверьте критерии", icon: ListChecks };
  if (type === "critical_call_alert") return { tone: "danger" as const, label: "Провальный звонок", icon: CircleAlert };
  if (type === "weekly_digest_ready") return { tone: "info" as const, label: "Итоги недели", icon: BarChart3 };
  if (type === "password_changed") return { tone: "warning" as const, label: "Пароль изменён", icon: ShieldAlert };
  if (type === "call_subject_marked" || type === "call_subjects_changed") return { tone: "info" as const, label: type === "call_subject_marked" ? "Отметка в звонке" : "Состав звонка", icon: Users };
  if (type === "invitation") return { tone: "invitation" as const, label: "Приглашение", icon: UserPlus };
  if (type === "action_completed" || type === "report_ready") return { tone: "success" as const, label: type === "report_ready" ? "Отчёт готов" : "Выполнено", icon: type === "report_ready" ? FileCheck2 : CheckCircle2 };
  if (type === "action_cancelled" || type === "processing_failed") return { tone: "danger" as const, label: type === "processing_failed" ? "Ошибка обработки" : "Отменено", icon: type === "processing_failed" ? CircleAlert : XCircle };
  if (type === "action_overdue" || type === "action_grace_started") return { tone: "danger" as const, label: type === "action_overdue" ? "Просрочено" : "Срок истекает", icon: AlarmClock };
  if (type === "action_reminder" || type === "action_due_changed") return { tone: "warning" as const, label: type === "action_due_changed" ? "Срок изменён" : "Напоминание", icon: BellRing };
  if (type.includes("transfer") || type === "action_reassigned") return { tone: "warning" as const, label: "Передача задачи", icon: RefreshCw };
  if (type === "action_assigned") return { tone: "info" as const, label: "Новая задача", icon: UserRoundCheck };
  if (notification.entity_type === "report") return { tone: "success" as const, label: "Отчёт", icon: FileCheck2 };
  return { tone: "info" as const, label: "Событие", icon: BellRing };
}
