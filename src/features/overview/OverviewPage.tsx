import { CustomOverview } from "./CustomOverview";
import type { AppPage, CallResponse } from "../../types";
import type { OpenCallAt } from "../analytics/AnalyticsPage";

export function OverviewPage(props: {
  calls: CallResponse[];
  callsVersion: string;
  onNavigate?: (page: AppPage) => void;
  onOpenCall?: OpenCallAt;
  canMonitor?: boolean;
}) {
  return <CustomOverview {...props} />;
}
