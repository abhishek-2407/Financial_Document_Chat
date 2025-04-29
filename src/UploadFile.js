import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './UploadFile.css';
import { ApiUrl } from './Constants';
import { UserId } from './Constants';
import { ClipLoader } from 'react-spinners';

import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const UploadFile = () => {
  const [folders, setFolders] = useState([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [filesByFolder, setFilesByFolder] = useState({});
  const [pendingUploads, setPendingUploads] = useState({});
  const [loadingUpload, setLoadingUpload] = useState({});
  const [loadingRAG, setLoadingRAG] = useState({});
  const [loadingDelete, setLoadingDelete] = useState({});


  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      const response = await axios.get(`${ApiUrl}/doc-eval/get-files-and-folders`);
      if (response.data.status === 'success') {
        const folderMap = {};
        response.data.data.forEach(file => {
          if (!folderMap[file.folder_name]) {
            folderMap[file.folder_name] = [];
          }
          folderMap[file.folder_name].push(file);
        });
        setFilesByFolder(folderMap);
        setFolders(Object.keys(folderMap));
      }
    } catch (error) {
      console.error('Error fetching files:', error);
    }
  };

  const handleCreateFolder = () => {
    if (!newFolderName) return;
    if (!folders.includes(newFolderName)) {
      setFolders([...folders, newFolderName]);
      setFilesByFolder({ ...filesByFolder, [newFolderName]: [] });
      setNewFolderName('');
    }
  };

  const handleFileSelection = (event, folderName) => {
    const file = event.target.files[0];
    if (!file) return;
    setPendingUploads(prev => ({
      ...prev,
      [folderName]: [...(prev[folderName] || []), file]
    }));
  };

  const handleUploadDocuments = async (folderName) => {
    const files = pendingUploads[folderName];
    if (!files || files.length === 0) return;
    setLoadingUpload(prev => ({ ...prev, [folderName]: true }));

    try {
      const filePayload = files.map(file => ({
        fileName: file.name,
        fileType: file.type
      }));

      const response = await axios.post(`${ApiUrl}/doc-eval/get-presigned-urls`, {
        user_id: UserId,
        files: filePayload,
        folder_name: folderName,
        thread_id: folderName
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
            folder_name: folderName,
            rag_status: false
          };
        }));

        setFilesByFolder(prev => ({
          ...prev,
          [folderName]: [...(prev[folderName] || []), ...newFiles]
        }));

        setPendingUploads(prev => ({ ...prev, [folderName]: [] }));
      }
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      setLoadingUpload(prev => ({ ...prev, [folderName]: false }));
    }
  };

  const handleCreateRAG = async (file_id, folderName) => {
    setLoadingRAG(prev => ({ ...prev, [file_id]: true }));
    try {
      const response = await axios.post(`${ApiUrl}/doc-eval/create-knowledge-base`, {
        file_id_list: [file_id],
        thread_id: folderName,
        upload_type: "file",
        user_id: UserId
      });
      if (response.data.status === 'success') {
        const updatedFiles = filesByFolder[folderName].map(file =>
          file.file_id === file_id ? { ...file, rag_status: true } : file
        );
        setFilesByFolder({ ...filesByFolder, [folderName]: updatedFiles });
      }
    } catch (error) {
      console.error('RAG creation failed:', error);
    } finally {
      setLoadingRAG(prev => ({ ...prev, [file_id]: false }));
    }
  };

  const handleDeleteFile = async (fileId, folderName) => {
    setLoadingDelete(prev => ({ ...prev, [fileId]: true }));

    try {
      const response = await axios.post(`${ApiUrl}/doc-eval/delete-file`, {
        file_id: fileId,
        thread_id: folderName
      });

      if (response.data.status === 200 || response.data.status === 'success') {
        const updatedFiles = filesByFolder[folderName].filter(file => file.file_id !== fileId);
        setFilesByFolder(prev => ({
          ...prev,
          [folderName]: updatedFiles
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

  return (
    <div className='upload_file'>
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

      <div className="folders-grid">


      {folders.map((folder) => (
        <div key={folder} className="folder-block">
          <h2>{folder}</h2>
          <div className="upload-box">
            <input
              type="file"
              onChange={(e) => handleFileSelection(e, folder)}
              accept="application/pdf"
            />
            <button className="upload-btn" onClick={() => handleUploadDocuments(folder)}>
              {loadingUpload[folder] ? <ClipLoader color="#fff" size={20} /> : 'Upload Documents'}
            </button>
          </div>
          <table className="file-table">
            <thead>
              <tr>
                <th className="col-filename">File Name</th>
                <th className="col-status">Status</th>
                <th className="col-action">Action</th>
                <th className="col-delete">Delete</th>
              </tr>
            </thead>
            <tbody>
              {(filesByFolder[folder] || []).map((file) => (
                <tr key={file.file_id}>
                  <td>{file.file_name}</td>
                  <td>
                    {file.rag_status ? <span className="success">✅ RAG Created</span> : 'Pending'}
                  </td>
                  <td>
                    {!file.rag_status && (
                      <button onClick={() => handleCreateRAG(file.file_id, folder)}>
                        {loadingRAG[file.file_id] ? <ClipLoader color="#000" size={15} /> : 'Create RAG'}
                      </button>
                    )}
                  </td>
                  <td>
                    <button className="delete-btn" onClick={() => handleDeleteFile(file.file_id, folder)}>
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
      ))}
      </div>
    </div>
    </div>
  );
};

export default UploadFile;
