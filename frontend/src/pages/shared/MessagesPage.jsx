import { EmptyState } from "../../components/ui/index.jsx";

export default function MessagesPage() {
  return (
    <div>
      <h1 className="font-display text-4xl">Messages</h1>
      <div className="mt-8">
        <EmptyState title="Secure messaging — coming soon" body="Provider-to-provider messaging will sit on the same RBAC and audit model. It is not part of this MVP." />
      </div>
    </div>
  );
}
