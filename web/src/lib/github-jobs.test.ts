import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchJobPostings } from "./github-jobs";

function mockResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: async () => body
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchJobPostings", () => {
  it("maps issues into job postings and filters out pull requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse([
        { id: 1, title: "Vaga backend", body: "descricao", html_url: "https://x/1" },
        { id: 2, title: "A PR, not a job", body: "n/a", html_url: "https://x/2", pull_request: {} }
      ])
    );
    vi.stubGlobal("fetch", fetchMock);

    const jobs = await fetchJobPostings(["backend-br/vagas"]);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      id: "1",
      title: "Vaga backend",
      body: "descricao",
      url: "https://x/1",
      repo: "backend-br/vagas"
    });
  });

  it("fetches from multiple repos concurrently and flattens the results", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse([{ id: 1, title: "t", body: "b", html_url: "u" }]));
    vi.stubGlobal("fetch", fetchMock);

    const jobs = await fetchJobPostings(["frontendbr/vagas", "react-brasil/vagas"]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(jobs).toHaveLength(2);
  });

  it("throws with a descriptive message when the GitHub API request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(null, false, 404)));

    await expect(fetchJobPostings(["frontendbr/vagas"])).rejects.toThrow(/frontendbr\/vagas.*404/);
  });

  it("defaults a null body to an empty string", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockResponse([{ id: 1, title: "t", body: null, html_url: "u" }]))
    );

    const jobs = await fetchJobPostings(["frontendbr/vagas"]);
    expect(jobs[0].body).toBe("");
  });
});
