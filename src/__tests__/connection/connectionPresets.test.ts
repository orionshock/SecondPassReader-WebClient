import { describe, expect, it, vi } from "vitest";
import { verifySecondPassServer } from "../../features/connection/ConnectionServer.Queries";

describe("preset connection verification", () => {
  it("discovers a selected preset through the well-known flow", async () => {
    const discovery = { server_name: "Production Library", api_base_url: "https://library.example.com/api/v1" };
    const discover = vi.fn().mockResolvedValue(discovery);

    await expect(verifySecondPassServer("https://library.example.com", discover)).resolves.toEqual({
      serverBaseUrl: "https://library.example.com",
      discovery,
    });
    expect(discover).toHaveBeenCalledOnce();
    expect(discover).toHaveBeenCalledWith("https://library.example.com");
  });
});
