import { CbuWorkspace } from "@/components/cbu/cbu-workspace";
import LegacyCbuCalcPage from "./legacy-page";

type SearchParams = { [key: string]: string | string[] | undefined };

/**
 * CBU page (SPEC §11.9). The rebuilt workspace is the default; the pre-v2 page stays reachable with `?legacy=1`
 * for one release so results can be compared, then it is removed (SPEC §11.11 C5).
 */
export default function CbuCalcPage({ params, searchParams }: { params: { id: string }; searchParams?: SearchParams }) {
  if (searchParams?.legacy === "1") {
    return <LegacyCbuCalcPage params={params} searchParams={searchParams} />;
  }
  const type = typeof searchParams?.type === "string" ? searchParams.type : undefined;
  const group = typeof searchParams?.group === "string" ? searchParams.group : undefined;
  return <CbuWorkspace rfqId={params.id} initialType={type} initialGroup={group} />;
}
