import {
  RecallsWorkspace,
  type RecallListMode,
} from "@/components/recalls/recalls-workspace";

type RecallsPageProps = {
  searchParams: Promise<{
    tab?: string | string[];
  }>;
};

const recallListModes = ["declined", "opportunity", "goldenTime", "partialRecontact"] as const;

function toRecallListMode(value: string | undefined): RecallListMode | undefined {
  return recallListModes.includes(value as RecallListMode) ? (value as RecallListMode) : undefined;
}

export default async function RecallsPage({ searchParams }: RecallsPageProps) {
  const params = await searchParams;
  const requestedTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const initialTab = toRecallListMode(requestedTab);

  return <RecallsWorkspace initialTab={initialTab} />;
}
