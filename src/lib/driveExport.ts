
// Initialize Firebase lazily and safely

export interface ExportProgress {
  status: 'idle' | 'fetching' | 'creating_root' | 'uploading' | 'success' | 'error';
  currentFile?: string;
  processedCount: number;
  totalCount: number;
  errorMessage?: string;
  folderUrl?: string;
}


export async function exportDatabaseToGoogleDrive(
  accessToken: string,
  onProgress: (progress: ExportProgress) => void
) {
  try {
    onProgress({
      status: 'fetching',
      processedCount: 0,
      totalCount: 1
    });

    const res = await fetch('/api/admin/database-file');
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.message || 'Failed to fetch database file from backend.');
    }

    onProgress({
      status: 'creating_root',
      processedCount: 0,
      totalCount: 1
    });

    const rootFolderId = await createFolder(accessToken, 'KiloPortfoliosBackup', 'root');

    onProgress({
      status: 'uploading',
      currentFile: 'portfolio.db',
      processedCount: 0,
      totalCount: 1
    });

    const filename = `portfolio_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
    await uploadFile(accessToken, filename, rootFolderId, data.content, true);

    onProgress({
      status: 'success',
      processedCount: 1,
      totalCount: 1,
      folderUrl: `https://drive.google.com/drive/folders/${rootFolderId}`
    });
  } catch (error: any) {
    console.error('Database Drive Export Error:', error);
    onProgress({
      status: 'error',
      processedCount: 0,
      totalCount: 0,
      errorMessage: error.message || 'An unknown error occurred during Google Drive database backup.'
    });
  }
}

export async function exportToGoogleDrive(
  accessToken: string,
  onProgress: (progress: ExportProgress) => void
) {
  try {
    // 1. Fetch project files from our custom backend API
    onProgress({
      status: 'fetching',
      processedCount: 0,
      totalCount: 0
    });
    
    const res = await fetch('/api/admin/project-files');
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch project files from backend.');
    }
    
    const files: { path: string; content: string; isBinary: boolean }[] = data.files;
    const totalFiles = files.length;
    
    // 2. Create the root folder "KiloNew" on Google Drive
    onProgress({
      status: 'creating_root',
      processedCount: 0,
      totalCount: totalFiles
    });
    
    const rootFolderId = await createFolder(accessToken, 'KiloNew', 'root');
    
    // Keep a cache of relative folder paths to Google Drive Folder IDs
    const folderCache: Record<string, string> = {
      '': rootFolderId
    };
    
    // 3. Process each file and upload
    let processed = 0;
    for (const file of files) {
      onProgress({
        status: 'uploading',
        currentFile: file.path,
        processedCount: processed,
        totalCount: totalFiles
      });
      
      // Resolve the parent directory structure
      const pathParts = file.path.split('/');
      const filename = pathParts.pop() || 'unnamed';
      
      let currentParentId = rootFolderId;
      const accumParts: string[] = [];
      
      for (const part of pathParts) {
        accumParts.push(part);
        const folderKey = accumParts.join('/');
        
        if (folderCache[folderKey]) {
          currentParentId = folderCache[folderKey];
        } else {
          // Folder doesn't exist yet, create it on Drive
          const newFolderId = await createFolder(accessToken, part, currentParentId);
          folderCache[folderKey] = newFolderId;
          currentParentId = newFolderId;
        }
      }
      
      // Upload the file into the resolved parent folder
      await uploadFile(accessToken, filename, currentParentId, file.content, file.isBinary);
      processed++;
    }
    
    // Success!
    onProgress({
      status: 'success',
      processedCount: totalFiles,
      totalCount: totalFiles,
      folderUrl: `https://drive.google.com/drive/folders/${rootFolderId}`
    });
    
  } catch (error: any) {
    console.error('Drive Export Error:', error);
    onProgress({
      status: 'error',
      processedCount: 0,
      totalCount: 0,
      errorMessage: error.message || 'An unknown error occurred during Google Drive export.'
    });
  }
}

// Helper to create a Google Drive folder
async function createFolder(accessToken: string, name: string, parentId: string): Promise<string> {
  const metadata: any = {
    name,
    mimeType: 'application/vnd.google-apps.folder'
  };
  
  if (parentId !== 'root') {
    metadata.parents = [parentId];
  }
  
  const res = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(metadata)
  });
  
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || `Failed to create folder "${name}".`);
  }
  return data.id;
}

// Helper to upload file content to a parent folder
async function uploadFile(
  accessToken: string,
  name: string,
  parentId: string,
  content: string,
  isBinary: boolean
): Promise<any> {
  const boundary = 'kilonew_multipart_boundary';
  const mimeType = getMimeType(name);
  
  const metadata = {
    name,
    parents: [parentId]
  };
  
  if (isBinary) {
    // Binary base64 conversion
    const binaryString = atob(content);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimeType });
    
    const formData = new FormData();
    formData.append(
      'metadata',
      new Blob([JSON.stringify(metadata)], { type: 'application/json' })
    );
    formData.append('file', blob);
    
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: formData
    });
    
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || `Failed to upload binary file "${name}".`);
    }
    return data;
  } else {
    // Text file upload
    const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
    const mediaPart = `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n${content}\r\n`;
    const closePart = `--${boundary}--`;
    
    const bodyStr = `${metaPart}${mediaPart}${closePart}`;
    
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: bodyStr
    });
    
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || `Failed to upload text file "${name}".`);
    }
    return data;
  }
}

function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'html': return 'text/html';
    case 'css': return 'text/css';
    case 'js': return 'application/javascript';
    case 'jsx': return 'application/javascript';
    case 'ts': return 'application/typescript';
    case 'tsx': return 'application/typescript';
    case 'json': return 'application/json';
    case 'md': return 'text/markdown';
    case 'png': return 'image/png';
    case 'jpg': case 'jpeg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    case 'ico': return 'image/x-icon';
    case 'pdf': return 'application/pdf';
    case 'zip': return 'application/zip';
    default: return 'text/plain';
  }
}
