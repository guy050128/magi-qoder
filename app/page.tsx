import ClassicConsole from "@/components/ClassicConsole";
import "./console-motion.css";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const params = await searchParams;
  return <ClassicConsole enhanced={params.view !== "classic"} />;
}
