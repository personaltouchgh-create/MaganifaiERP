import type { ExampleDto as ExampleDtoType } from "@repo/shared";
import { ExampleDto } from "@repo/shared";
import { redact } from "@repo/security";

export function App() {
  const parsed = ExampleDto.safeParse({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString()
  });

  const view: unknown = parsed.success
    ? (parsed.data satisfies ExampleDtoType)
    : parsed.error.format();

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>ERP Web</h1>
      <pre>{JSON.stringify(redact(view), null, 2)}</pre>
    </div>
  );
}
