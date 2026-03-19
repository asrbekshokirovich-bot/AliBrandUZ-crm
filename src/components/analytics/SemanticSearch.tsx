import { useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface SemanticSearchProps {
  onSearch: (query: string) => void;
  isSearching: boolean;
}

export function SemanticSearch({ onSearch, isSearching }: SemanticSearchProps) {
  const [query, setQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Nima qidiryapsiz? (Masalan: bolalar uchun issiq kurtka arzon narxda)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9 w-full bg-background"
          disabled={isSearching}
        />
      </div>
      <Button type="submit" disabled={isSearching || !query.trim()}>
        {isSearching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
        Qidirish
      </Button>
    </form>
  );
}
