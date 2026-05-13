import { z } from "zod";

export const ExampleDto = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime()
});

export type ExampleDto = z.infer<typeof ExampleDto>;

