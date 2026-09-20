import { describe, expect, it, vi } from "vitest";
import { verifySecondPassServer } from "../../features/connection/ConnectionServer.Queries";

describe("preset connection verification", () => {
  it("discovers a selected preset through the well-known flow", async () => {
    const discovery = { serverId: "123e4567-e89b-42d3-a456-426614174000", server_name: "Production Library" };
    const discover = vi.fn().mockResolvedValue(discovery);

    await expect(verifySecondPassServer("https://library.example.com", discover)).resolves.toEqual({
      serverBaseUrl: "https://library.example.com",
      discovery,
    });
    expect(discover).toHaveBeenCalledOnce();
    expect(discover).toHaveBeenCalledWith("https://library.example.com");
  });
});
