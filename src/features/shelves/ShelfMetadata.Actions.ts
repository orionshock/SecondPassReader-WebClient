import type { CreateShelfInput, UpdateShelfInput } from "@secondpass/client";
import type { ShelfFormValues } from "./ShelfForm.Types";

export function createPersonalShelfInput(values: ShelfFormValues): CreateShelfInput {
  return {
    name: values.name.trim(),
    description: values.description,
    owner_type: "user",
    visibility: values.visibility,
  };
}

export function updatePersonalShelfInput(values: ShelfFormValues): UpdateShelfInput {
  return {
    name: values.name.trim(),
    description: values.description,
    visibility: values.visibility,
  };
}

