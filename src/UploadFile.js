import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './UploadFile.css';
import { ApiUrl } from './Constants';
import { UserId } from './Constants';
import { ClipLoader } from 'react-spinners';

import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const UploadFile = () => {
  const [newFolderName, setNewFolderName] = useState('');
  const [newSubFolderName, setNewSubFolderName] = useState('');
  const [selectedParentFolder, setSelectedParentFolder] = useState('');
  const [filesByFolder, setFilesByFolder] = useState({});
  const [folderStructure, setFolderStructure] = useState({});
  const [pendingUploads, setPendingUploads] = useState({});
  const [loadingUpload, setLoadingUpload] = useState({});
  const [loadingRAG, setLoadingRAG] = useState({});
  const [loadingDelete, setLoadingDelete] = useState({});
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [collapsedFolders, setCollapsedFolders] = useState({});

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    setLoadingFiles(true);
    try {
      const response = await axios.get(`${ApiUrl}/doc-eval/get-files-and-folders`);
      if (response.data.status === 'success') {
        const folderMap = {};
        const structureMap = {};

        response.data.data.forEach(file => {
          const folderPath = file.folder_name;

          // Handle folder paths (potentially with subdirectories)
          if (!folderMap[folderPath]) {
            folderMap[folderPath] = [];
          }
          folderMap[folderPath].push(file);

          // Build folder structure
          const pathParts = folderPath.split('/');
          let currentLevel = structureMap;

          pathParts.forEach((part, index) => {
            if (!currentLevel[part]) {
              currentLevel[part] = {};
            }
            currentLevel = currentLevel[part];
          });
        });

        setFilesByFolder(folderMap);
        setFolderStructure(structureMap);
      }
    } catch (error) {
      console.error('Error fetching files:', error);
      toast.error("Failed to load files and folders");
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleCreateFolder = () => {
    if (!newFolderName) return;
    
    // Check if folder already exists
    if (!Object.keys(folderStructure).includes(newFolderName)) {
      setFolderStructure(prev => ({
        ...prev,
        [newFolderName]: {}
      }));
      setFilesByFolder(prev => ({
        ...prev,
        [newFolderName]: []
      }));
      setNewFolderName('');
      toast.success(`Folder "${newFolderName}" created successfully!`);
    } else {
      toast.error("Folder already exists");
    }
  };

  const handleCreateSubFolder = () => {
    if (!newSubFolderName || !selectedParentFolder) return;

    const newPath = `${selectedParentFolder}/${newSubFolderName}`;
    
    // Check if path already exists using helper function
    if (!getFolderPathList().includes(newPath)) {
      // Update folder structure
      setFolderStructure(prev => {
        const updatedStructure = { ...prev };
        let currentLevel = updatedStructure;

        // Navigate to the parent folder
        const parentParts = selectedParentFolder.split('/');
        for (const part of parentParts) {
          if (!currentLevel[part]) currentLevel[part] = {};
          currentLevel = currentLevel[part];
        }

        // Add the sub-folder
        currentLevel[newSubFolderName] = {};

        return updatedStructure;
      });

      // Initialize files array for this path
      setFilesByFolder(prev => ({
        ...prev,
        [newPath]: []
      }));

      setNewSubFolderName('');
      toast.success(`Sub-folder "${newSubFolderName}" created successfully!`);
    } else {
      toast.error("Sub-folder already exists");
    }
  };

  const toggleCollapse = (folderPath) => {
    setCollapsedFolders(prev => ({
      ...prev,
      [folderPath]: !prev[folderPath]
    }));
  };

  const handleFileSelection = (event, folderPath) => {
    const selectedFiles = Array.from(event.target.files);
    if (selectedFiles.length === 0) return;
    setPendingUploads(prev => ({
      ...prev,
      [folderPath]: [...(prev[folderPath] || []), ...selectedFiles]
    }));
    event.target.value = null;
  };

  const handleRemovePendingFile = (folderPath, indexToRemove) => {
    setPendingUploads(prev => ({
      ...prev,
      [folderPath]: prev[folderPath].filter((_, idx) => idx !== indexToRemove)
    }));
  };

  const handleUploadDocuments = async (folderPath) => {
    const files = pendingUploads[folderPath];
    if (!files || files.length === 0) return;
    setLoadingUpload(prev => ({ ...prev, [folderPath]: true }));

    try {
      const filePayload = files.map(file => ({
        fileName: file.name,
        fileType: file.type
      }));

      const response = await axios.post(`${ApiUrl}/doc-eval/get-presigned-urls`, {
        user_id: UserId,
        files: filePayload,
        folder_name: folderPath,
        thread_id: folderPath.split('/')[0] // Use top-level folder as thread_id
      });

      if (response.data.status_code === 200) {
        const newFiles = await Promise.all(response.data.urls.map(async (urlObj, index) => {
          const file = files[index];
          await axios.put(urlObj.presigned_url, file, {
            headers: {
              'Content-Type': file.type
            }
          });
          return {
            file_name: file.name,
            s3_file_url: urlObj.file_url,
            file_id: urlObj.file_id,
            folder_name: folderPath,
            rag_status: false
          };
        }));

        setFilesByFolder(prev => ({
          ...prev,
          [folderPath]: [...(prev[folderPath] || []), ...newFiles]
        }));

        setPendingUploads(prev => ({ ...prev, [folderPath]: [] }));
        toast.success("Files uploaded successfully!");
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error("Upload failed");
    } finally {
      setLoadingUpload(prev => ({ ...prev, [folderPath]: false }));
    }
  };

  const handleCreateRAG = async (file_id, folderPath) => {
    setLoadingRAG(prev => ({ ...prev, [file_id]: true }));
    try {
      const response = await axios.post(`${ApiUrl}/doc-eval/create-knowledge-base`, {
        file_id_list: [file_id],
        thread_id: folderPath.split('/')[0], // Use top-level folder as thread_id
        upload_type: "file",
        user_id: UserId
      });
      if (response.data.status === 'success') {
        const updatedFiles = filesByFolder[folderPath].map(file =>
          file.file_id === file_id ? { ...file, rag_status: true } : file
        );
        setFilesByFolder(prev => ({ ...prev, [folderPath]: updatedFiles }));
        toast.success("RAG created successfully!");
      }
    } catch (error) {
      console.error('RAG creation failed:', error);
      toast.error("RAG creation failed");
    } finally {
      setLoadingRAG(prev => ({ ...prev, [file_id]: false }));
    }
  };

  const handleDeleteFile = async (fileId, folderPath) => {
    setLoadingDelete(prev => ({ ...prev, [fileId]: true }));

    try {
      const response = await axios.post(`${ApiUrl}/doc-eval/delete-file`, {
        file_id: fileId,
        thread_id: folderPath.split('/')[0] // Use top-level folder as thread_id
      });

      if (response.data.status === 200 || response.data.status === 'success') {
        const updatedFiles = filesByFolder[folderPath].filter(file => file.file_id !== fileId);
        setFilesByFolder(prev => ({
          ...prev,
          [folderPath]: updatedFiles
        }));
        toast.success("File deleted successfully!");
      } else {
        toast.error("File deletion failed.");
      }
    } catch (error) {
      console.error('File deletion failed:', error);
      toast.error("An error occurred while deleting the file.");
    } finally {
      setLoadingDelete(prev => ({ ...prev, [fileId]: false }));
    }
  };

  // Helper function to get all folder paths including sub-folders
  const getFolderPathList = () => {
    const paths = [];

    const traverseFolderStructure = (structure, currentPath = '') => {
      Object.keys(structure).forEach(folder => {
        const folderPath = currentPath ? `${currentPath}/${folder}` : folder;
        paths.push(folderPath);
        traverseFolderStructure(structure[folder], folderPath);
      });
    };

    traverseFolderStructure(folderStructure);
    return paths;
  };

  // Render folder content (files and upload controls)
  const renderFolderContent = (folderPath) => {
    return (
      <div className="folder-content">
        <div className="upload-box">
          <input
            type="file"
            multiple
            onChange={(e) => handleFileSelection(e, folderPath)}
            accept="application/pdf"
          />
          <button
            className="upload-btn"
            onClick={() => handleUploadDocuments(folderPath)}
            disabled={loadingUpload[folderPath]}
          >
            {loadingUpload[folderPath] ? <ClipLoader color="#fff" size={20} /> : 'Upload Documents'}
          </button>
        </div>

        {(pendingUploads[folderPath] || []).length > 0 && (
          <div className="selected-files">
            <p>Selected files:</p>
            <ul>
              {pendingUploads[folderPath].map((file, idx) => (
                <li key={idx}>
                  {file.name}{' '}
                  <button
                    className="remove-btn"
                    onClick={() => handleRemovePendingFile(folderPath, idx)}
                  >
                    ❌
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <table className="file-table">
          <thead>
            <tr>
              <th className="col-filename">File Name</th>
              <th className="col-status">RAG</th>
              <th className="col-action">Action</th>
              <th className="col-delete">Delete</th>
            </tr>
          </thead>
          <tbody>
            {(filesByFolder[folderPath] || []).map((file) => (
              <tr key={file.file_id}>
                <td>{file.file_name}</td>
                <td>
                  {file.rag_status ? <span className="success">✅</span> : 'Pending'}
                </td>
                <td>
                  {!file.rag_status && (
                    <button onClick={() => handleCreateRAG(file.file_id, folderPath)}>
                      {loadingRAG[file.file_id] ? <ClipLoader color="#000" size={15} /> : 'Create RAG'}
                    </button>
                  )}
                </td>
                <td>
                  <button className="delete-btn" onClick={() => handleDeleteFile(file.file_id, folderPath)}>
                    {loadingDelete[file.file_id] ? (
                      <ClipLoader color="#fff" size={15} />
                    ) : (
                      '🗑️'
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // Recursively render folders and their subfolders
  const renderFolder = (folderName, structure, path = '', depth = 0) => {
    const currentPath = path ? `${path}/${folderName}` : folderName;
    const isCollapsed = collapsedFolders[currentPath];
    const hasSubfolders = Object.keys(structure).length > 0;
    const isParentFolder = depth === 0; // Check if this is a top-level parent folder
    
    return (
      <div key={currentPath} className={`folder-block depth-${depth}`}>
        <div className="folder-header">
          <h2>
            <span
              className="folder-collapse-toggle"
              onClick={() => toggleCollapse(currentPath)}
            >
              {isCollapsed ? '▶️' : '🔽'} {folderName}
            </span>
          </h2>
          
          {/* Only show "Add Sub-folder" button for parent folders (depth 0) */}
          {isParentFolder && (
            <button
              className="add-subfolder-btn"
              onClick={() => setSelectedParentFolder(currentPath)}
            >
              + Add Sub-folder
            </button>
          )}
        </div>
        
        {!isCollapsed && (
          <>
            {/* Render subfolders FIRST */}
            {hasSubfolders && (
              <div className="subfolders-container">
                {Object.keys(structure).map(subFolderName => 
                  renderFolder(subFolderName, structure[subFolderName], currentPath, depth + 1)
                )}
              </div>
            )}
            
            {/* Then render this folder's content */}
            {renderFolderContent(currentPath)}
          </>
        )}
      </div>
    );
  };

  // Render only the top-level parent folders
  const renderParentFolders = () => {
    return (
      <div className="folders-grid-container">
        {Object.keys(folderStructure).map(folderName => 
          renderFolder(folderName, folderStructure[folderName])
        )}
      </div>
    );
  };

  return (
    <div className="upload_file">
      <div className="app-container">
        <ToastContainer position="top-right" autoClose={2000} hideProgressBar />

        <h1>📁 RAG Document Manager</h1>

        <div className="folder-creator">
          <input
            type="text"
            value={newFolderName}
            placeholder="New Folder Name"
            onChange={(e) => setNewFolderName(e.target.value)}
          />
          <button onClick={handleCreateFolder}>Create Folder</button>
        </div>

        {selectedParentFolder && (
          <div className="subfolder-creator">
            <h3>Creating subfolder in: {selectedParentFolder}</h3>
            <div className="subfolder-inputs">
              <input
                type="text"
                value={newSubFolderName}
                placeholder="Sub-folder Name"
                onChange={(e) => setNewSubFolderName(e.target.value)}
              />
              <button onClick={handleCreateSubFolder}>Create Sub-folder</button>
              <button onClick={() => setSelectedParentFolder('')}>Cancel</button>
            </div>
          </div>
        )}

        {loadingFiles ? (
          <div className="loading-container">
            <ClipLoader color="#d4076a" size={40} />
            <p>Loading folders and files...</p>
          </div>
        ) : (
          <>
            {Object.keys(folderStructure).length === 0 ? (
              <div className="no-folders">
                <p>No folders found. Create a new folder to get started.</p>
              </div>
            ) : (
              // Use the grid layout for parent folders
              renderParentFolders()
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default UploadFile;
