import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Arshad Stamp Maker" },
      {
        name: "description",
        content:
          "Design custom round, oval and rectangular stamps with curved Arabic and English text.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <iframe
      src="/stamp/index.html"
      title="Arshad Stamp Maker"
      style={{ border: 0, width: "100vw", height: "100vh", display: "block" }}
    />
  );
}
