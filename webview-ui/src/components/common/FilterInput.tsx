import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button'; // Import Button
import { Search, X } from 'lucide-react';

interface FilterInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const FilterInput: React.FC<FilterInputProps> = ({
  value,
  onValueChange,
  placeholder = "Filter items...",
  className,
  ...props
}) => {
  return (
    <div className={`relative flex items-center rounded-lg ${className || ''}`}>
      <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className="pl-9 pr-8 h-9 text-sm rounded-lg" // Added pr-8 for clear button and rounded-lg
        {...props}
      />
      {value && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0 text-muted-foreground hover:text-foreground"
          onClick={() => onValueChange('')}
          aria-label="Clear filter"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
};

export default FilterInput;
