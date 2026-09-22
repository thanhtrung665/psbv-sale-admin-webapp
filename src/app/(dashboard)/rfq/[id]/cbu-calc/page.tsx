import { CbuWorkspace } from "@/components/cbu/cbu-workspace";

type SearchParams = { [key: string]: string | string[] | undefined };

export default function CbuCalcPage({ params, searchParams }: { params: { id: string }; searchParams?: SearchParams }) {
  const type = typeof searchParams?.type === "string" ? searchParams.type : undefined;
  const group = typeof searchParams?.group === "string" ? searchParams.group : undefined;
  return <CbuWorkspace rfqId={params.id} initialType={type} initialGroup={group} />;
}
