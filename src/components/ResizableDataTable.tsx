import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Pin, PinOff, RotateCcw, GripVertical, ChevronDown, ChevronUp } from 'lucide-react';

export interface ColumnDef<T> {
  id: string;
  header: string | React.ReactNode;
  cell: (row: T, index: number) => React.ReactNode;
  width?: number;
  minWidth?: number;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  sortValue?: (row: T) => any;
  defaultPinned?: 'left' | 'right' | false;
}

interface ResizableDataTableProps<T> {
  tableId?: string;
  columns: ColumnDef<T>[];
  data: T[];
  keyExtractor?: (item: T, index: number) => string | number;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  className?: string;
  compact?: boolean;
  footerRow?: React.ReactNode;
}

export function ResizableDataTable<T>({
  tableId,
  columns,
  data,
  keyExtractor,
  onRowClick,
  emptyMessage = 'No data available',
  className = '',
  compact = false,
  footerRow
}: ResizableDataTableProps<T>) {
  // Storage key
  const storageKey = tableId ? `table_config_${tableId}` : null;

  // Initialize state from localStorage or props
  const initialConfig = useMemo(() => {
    if (storageKey) {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          return JSON.parse(saved);
        }
      } catch (e) {
        console.error('Failed to parse table config', e);
      }
    }
    return null;
  }, [storageKey]);

  // Column order state
  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    if (initialConfig?.order) {
      // Ensure all current columns exist in saved order
      const valid = initialConfig.order.filter((id: string) => columns.some((c) => c.id === id));
      const missing = columns.filter((c) => !valid.includes(c.id)).map((c) => c.id);
      return [...valid, ...missing];
    }
    return columns.map((c) => c.id);
  });

  // Column width state
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const widths: Record<string, number> = {};
    columns.forEach((c) => {
      widths[c.id] = initialConfig?.widths?.[c.id] ?? c.width ?? 140;
    });
    return widths;
  });

  // Pinned columns state
  const [pinnedColumns, setPinnedColumns] = useState<Record<string, 'left' | 'right' | false>>(() => {
    if (initialConfig?.pinned) {
      return initialConfig.pinned;
    }
    const pinned: Record<string, 'left' | 'right' | false> = {};
    columns.forEach((c) => {
      pinned[c.id] = c.defaultPinned || false;
    });
    return pinned;
  });

  // Sorting state
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Dragging state for column reordering
  const [draggedColId, setDraggedColId] = useState<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);

  // Resizing state
  const [resizingColId, setResizingColId] = useState<string | null>(null);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);

  // Sync prop changes
  useEffect(() => {
    setColumnOrder((prev) => {
      const valid = prev.filter((id) => columns.some((c) => c.id === id));
      const missing = columns.filter((c) => !valid.includes(c.id)).map((c) => c.id);
      return [...valid, ...missing];
    });
  }, [columns]);

  // Save layout config to localStorage
  useEffect(() => {
    if (storageKey) {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            order: columnOrder,
            widths: columnWidths,
            pinned: pinnedColumns
          })
        );
      } catch (e) {
        console.error('Failed to save table config', e);
      }
    }
  }, [storageKey, columnOrder, columnWidths, pinnedColumns]);

  // Reset layout handler
  const handleResetLayout = () => {
    setColumnOrder(columns.map((c) => c.id));
    const widths: Record<string, number> = {};
    const pinned: Record<string, 'left' | 'right' | false> = {};
    columns.forEach((c) => {
      widths[c.id] = c.width ?? 140;
      pinned[c.id] = c.defaultPinned || false;
    });
    setColumnWidths(widths);
    setPinnedColumns(pinned);
    if (storageKey) {
      localStorage.removeItem(storageKey);
    }
  };

  // Toggle Pin handler
  const togglePin = (colId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPinnedColumns((prev) => ({
      ...prev,
      [colId]: prev[colId] === 'left' ? false : 'left'
    }));
  };

  // Mouse Resize Handler
  const handleMouseDownResize = (colId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setResizingColId(colId);
    startXRef.current = e.clientX;
    startWidthRef.current = columnWidths[colId] || 140;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startXRef.current;
      const minW = columns.find((c) => c.id === colId)?.minWidth || 60;
      const newWidth = Math.max(minW, startWidthRef.current + deltaX);
      setColumnWidths((prev) => ({
        ...prev,
        [colId]: newWidth
      }));
    };

    const onMouseUp = () => {
      setResizingColId(null);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Drag and Drop reordering handlers
  const handleDragStart = (colId: string, e: React.DragEvent) => {
    setDraggedColId(colId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (colId: string, e: React.DragEvent) => {
    e.preventDefault();
    if (draggedColId && draggedColId !== colId) {
      setDragOverColId(colId);
    }
  };

  const handleDrop = (colId: string, e: React.DragEvent) => {
    e.preventDefault();
    if (draggedColId && draggedColId !== colId) {
      const fromIndex = columnOrder.indexOf(draggedColId);
      const toIndex = columnOrder.indexOf(colId);
      if (fromIndex !== -1 && toIndex !== -1) {
        const newOrder = [...columnOrder];
        const [moved] = newOrder.splice(fromIndex, 1);
        newOrder.splice(toIndex, 0, moved);
        setColumnOrder(newOrder);
      }
    }
    setDraggedColId(null);
    setDragOverColId(null);
  };

  // Sort Handler
  const handleSort = (col: ColumnDef<T>) => {
    if (!col.sortable) return;
    if (sortColumn === col.id) {
      if (sortDirection === 'asc') setSortDirection('desc');
      else setSortColumn(null);
    } else {
      setSortColumn(col.id);
      setSortDirection('asc');
    }
  };

  // Sort Data
  const sortedData = useMemo(() => {
    if (!sortColumn) return data;
    const col = columns.find((c) => c.id === sortColumn);
    if (!col) return data;

    return [...data].sort((a, b) => {
      let valA = col.sortValue ? col.sortValue(a) : (a as any)[col.id];
      let valB = col.sortValue ? col.sortValue(b) : (b as any)[col.id];

      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;

      if (typeof valA === 'string' && typeof valB === 'string') {
        const cmp = valA.localeCompare(valB);
        return sortDirection === 'asc' ? cmp : -cmp;
      }

      return sortDirection === 'asc' ? (valA < valB ? -1 : 1) : valA > valB ? -1 : 1;
    });
  }, [data, sortColumn, sortDirection, columns]);

  // Order columns with pinned left columns first
  const orderedColumns = useMemo(() => {
    const colMap = new Map(columns.map((c) => [c.id, c]));
    const list = columnOrder.map((id) => colMap.get(id)).filter(Boolean) as ColumnDef<T>[];

    const pinnedLeft = list.filter((c) => pinnedColumns[c.id] === 'left');
    const unpinned = list.filter((c) => !pinnedColumns[c.id]);
    const pinnedRight = list.filter((c) => pinnedColumns[c.id] === 'right');

    return [...pinnedLeft, ...unpinned, ...pinnedRight];
  }, [columnOrder, columns, pinnedColumns]);

  // Calculate sticky left offsets for pinned columns
  const leftOffsets = useMemo(() => {
    const offsets: Record<string, number> = {};
    let currentLeft = 0;
    orderedColumns.forEach((c) => {
      if (pinnedColumns[c.id] === 'left') {
        offsets[c.id] = currentLeft;
        currentLeft += columnWidths[c.id] || 140;
      }
    });
    return offsets;
  }, [orderedColumns, pinnedColumns, columnWidths]);

  // Calculate total table width to ensure minimum boundary on mobile
  const totalTableWidth = useMemo(() => {
    return orderedColumns.reduce((sum, col) => sum + (columnWidths[col.id] || col.width || 140), 0);
  }, [orderedColumns, columnWidths]);

  return (
    <div className={`w-full flex flex-col ${className}`}>
      {/* Table Top Controls Bar (if tableId is supplied) */}
      {tableId && (
        <div className="flex items-center justify-between px-2 py-1 text-xs mb-1 text-[var(--text-muted)]">
          <span className="text-[11px]">
            Drag column headers to reorder • Drag edges to resize • Click <Pin className="w-3 h-3 inline mx-0.5" /> to freeze pane
          </span>
          <button
            onClick={handleResetLayout}
            className="flex items-center gap-1 hover:text-[var(--accent-gold)] transition-colors cursor-pointer px-2 py-0.5 rounded border border-[var(--border-card)] bg-[var(--bg-table-alt)]"
            title="Reset column sizes, order and pinned panes"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Columns</span>
          </button>
        </div>
      )}

      {/* Mobile Horizontal Scroll Hint */}
      <div className="lg:hidden flex items-center justify-between text-[11px] font-mono px-3 py-1.5 mb-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          Swipe table horizontally to inspect all columns
        </span>
        <span className="text-cyan-400 font-bold text-xs">⟷</span>
      </div>

      {/* Main Table Container with Fluid Touch Momentum Scrolling */}
      <div 
        className="w-full overflow-x-auto touch-scroll-container table-scroll-container border border-[var(--border-card)] rounded-xl relative shadow-sm"
        style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x pan-y' }}
      >
        <table className="w-full text-left border-collapse text-xs" style={{ minWidth: `${Math.max(totalTableWidth, 800)}px` }}>
          <thead>
            <tr className="bg-[var(--bg-table-alt)] text-[var(--text-secondary)] font-bold uppercase tracking-wider border-b border-[var(--border-card)] select-none">
              {orderedColumns.map((col) => {
                const width = columnWidths[col.id] || 140;
                const isPinnedLeft = pinnedColumns[col.id] === 'left';
                const leftOffset = isPinnedLeft ? leftOffsets[col.id] : undefined;
                const isDragging = draggedColId === col.id;
                const isDragOver = dragOverColId === col.id;

                return (
                  <th
                    key={col.id}
                    draggable={!resizingColId}
                    onDragStart={(e) => handleDragStart(col.id, e)}
                    onDragOver={(e) => handleDragOver(col.id, e)}
                    onDrop={(e) => handleDrop(col.id, e)}
                    onDragEnd={() => {
                      setDraggedColId(null);
                      setDragOverColId(null);
                    }}
                    onClick={() => handleSort(col)}
                    style={{
                      width: `${width}px`,
                      minWidth: `${col.minWidth || 60}px`,
                      position: isPinnedLeft ? 'sticky' : 'relative',
                      left: isPinnedLeft ? `${leftOffset}px` : undefined,
                      zIndex: isPinnedLeft ? 20 : 1,
                      backgroundColor: isPinnedLeft ? 'var(--bg-table-alt)' : undefined,
                      borderRight: isPinnedLeft ? '2px solid var(--accent-gold)' : '1px solid var(--border-card)',
                      boxShadow: isPinnedLeft ? '3px 0 6px -2px rgba(0,0,0,0.15)' : undefined
                    }}
                    className={`relative p-2.5 transition-colors ${compact ? 'py-1.5 px-2' : 'py-3 px-3'} ${
                      col.sortable ? 'cursor-pointer hover:bg-[var(--bg-card-hover)]' : ''
                    } ${isDragging ? 'opacity-40' : ''} ${isDragOver ? 'border-l-2 border-l-[var(--accent-gold)]' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-1 w-full overflow-hidden">
                      {/* Drag Handle & Label */}
                      <div className="flex items-center gap-1.5 truncate flex-1">
                        <GripVertical className="w-3 h-3 text-[var(--text-muted)] opacity-40 hover:opacity-100 cursor-grab flex-shrink-0" />
                        <span className="truncate font-semibold text-[11px]">{col.header}</span>
                      </div>

                      {/* Sort Indicator */}
                      {col.sortable && sortColumn === col.id && (
                        <span className="text-[var(--accent-gold)] flex-shrink-0">
                          {sortDirection === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </span>
                      )}

                      {/* Pin Toggle Button */}
                      <button
                        onClick={(e) => togglePin(col.id, e)}
                        className={`p-0.5 rounded hover:bg-[var(--bg-card-hover)] transition-colors flex-shrink-0 cursor-pointer ${
                          isPinnedLeft ? 'text-[var(--accent-gold)]' : 'text-[var(--text-muted)] opacity-30 hover:opacity-100'
                        }`}
                        title={isPinnedLeft ? 'Unfreeze Pane' : 'Freeze Pane (Pin Left)'}
                      >
                        {isPinnedLeft ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                      </button>
                    </div>

                    {/* Resizer Handle */}
                    <div
                      onMouseDown={(e) => handleMouseDownResize(col.id, e)}
                      className={`absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-[var(--accent-gold)] z-30 transition-colors ${
                        resizingColId === col.id ? 'bg-[var(--accent-gold)]' : 'bg-transparent'
                      }`}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-[var(--border-card)] bg-[var(--bg-card)]">
            {sortedData.length === 0 ? (
              <tr>
                <td colSpan={orderedColumns.length} className="text-center py-8 text-[var(--text-muted)]">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sortedData.map((item, rowIdx) => {
                const key = keyExtractor ? keyExtractor(item, rowIdx) : rowIdx;
                return (
                  <tr
                    key={key}
                    onClick={() => onRowClick && onRowClick(item)}
                    className={`transition-colors hover:bg-[var(--bg-card-hover)] ${
                      rowIdx % 2 === 1 ? 'bg-[var(--bg-table-row)]' : ''
                    } ${onRowClick ? 'cursor-pointer' : ''}`}
                  >
                    {orderedColumns.map((col) => {
                      const width = columnWidths[col.id] || 140;
                      const isPinnedLeft = pinnedColumns[col.id] === 'left';
                      const leftOffset = isPinnedLeft ? leftOffsets[col.id] : undefined;

                      return (
                        <td
                          key={col.id}
                          style={{
                            width: `${width}px`,
                            minWidth: `${col.minWidth || 60}px`,
                            position: isPinnedLeft ? 'sticky' : 'relative',
                            left: isPinnedLeft ? `${leftOffset}px` : undefined,
                            zIndex: isPinnedLeft ? 10 : 1,
                            backgroundColor: isPinnedLeft
                              ? rowIdx % 2 === 1
                                ? 'var(--bg-table-row)'
                                : 'var(--bg-card)'
                              : undefined,
                            borderRight: isPinnedLeft ? '2px solid var(--accent-gold)' : '1px solid var(--border-card)',
                            boxShadow: isPinnedLeft ? '3px 0 6px -2px rgba(0,0,0,0.15)' : undefined,
                            textAlign: col.align || 'left'
                          }}
                          className={`p-2.5 overflow-hidden text-ellipsis ${compact ? 'py-1.5 px-2' : 'py-2.5 px-3'}`}
                        >
                          {col.cell(item, rowIdx)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>

          {footerRow && (
            <tfoot className="bg-[var(--bg-table-alt)] border-t-2 border-[var(--border-card)] font-bold text-[var(--text-primary)]">
              {footerRow}
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
