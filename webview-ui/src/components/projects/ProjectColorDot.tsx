import React from 'react';
import { cn } from '../../lib/utils';

interface ProjectColorDotProps {
  color: string;
  size?: 'sm' | 'md' | 'xs'; // Added 'xs' for potentially smaller dots in mini cards
}

const ProjectColorDot: React.FC<ProjectColorDotProps> = ({ color, size = 'md' }) => {
  const sizeClass = size === 'sm' ? 'w-2 h-2' : size === 'xs' ? 'w-1.5 h-1.5' : 'w-3 h-3'; // Adjusted for 'xs'
  return (
    <span
      className={cn('inline-block rounded-full mr-1.5 flex-shrink-0', sizeClass)} // slightly reduced mr
      style={{ backgroundColor: color }}
      aria-hidden="true"
    />
  );
};

export default ProjectColorDot;