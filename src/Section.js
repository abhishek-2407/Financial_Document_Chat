import React, { useState, useEffect, useRef } from 'react';
import './Section.css';
import { Send, ChevronRight, FolderOpen, File } from 'lucide-react';
import { FaRobot } from 'react-icons/fa';
import { PulseLoader } from 'react-spinners';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkGemoji from "remark-gemoji";
import { ApiUrl } from './Constants';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

function Section() {
    const [messages, setMessages] = useState([]);
    const [inputMessage, setInputMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [files, setFiles] = useState([]);
    const [selectedFileIds, setSelectedFileIds] = useState([]);
    const [openFolders, setOpenFolders] = useState({});
    const chatContainerRef = useRef(null);
    const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
    const [isUserScrolling, setIsUserScrolling] = useState(false);
    const userScrollTimerRef = useRef(null);

    const CHAT_URL = `${ApiUrl}/doc-eval/chat`;
    const FILES_URL = `${ApiUrl}/doc-eval/get-final-files`;

    useEffect(() => {
        setMessages([
            {
                content: "Welcome to the AI-powered document evaluation system. You can ask questions about the documents you've uploaded. Let's get started!",
                sender: "system"
            }
        ]);
        fetchFiles();
    }, []);

    useEffect(() => {
        if (shouldAutoScroll && !isUserScrolling) {
            scrollToBottom(true);
        }
    }, [messages, shouldAutoScroll, isUserScrolling]);

    useEffect(() => {
        const container = chatContainerRef.current;

        const handleScroll = () => {
            if (!container) return;

            // Clear any existing timer
            if (userScrollTimerRef.current) {
                clearTimeout(userScrollTimerRef.current);
            }

            // Set user is actively scrolling
            setIsUserScrolling(true);

            // Calculate if we're near the bottom
            const threshold = 100;
            const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;

            // Update auto-scroll state based on position
            setShouldAutoScroll(distanceFromBottom <= threshold);

            // Reset user scrolling state after a delay
            userScrollTimerRef.current = setTimeout(() => {
                setIsUserScrolling(false);
            }, 500);
        };

        if (container) {
            container.addEventListener('scroll', handleScroll);
        }

        return () => {
            if (container) {
                container.removeEventListener('scroll', handleScroll);
            }
            if (userScrollTimerRef.current) {
                clearTimeout(userScrollTimerRef.current);
            }
        };
    }, []);

    const scrollToBottom = (smooth = false) => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTo({
                top: chatContainerRef.current.scrollHeight,
                behavior: smooth ? 'smooth' : 'auto'
            });
        }
    };

    const fetchFiles = async () => {
        try {
            const response = await fetch(FILES_URL);
            const data = await response.json();
            if (data.status_code === 200) {
                setFiles(data.data);
                // Initialize all folders as closed
                const folderPaths = new Set();
                data.data.forEach(file => {
                    const parts = file.folder_name.split('/');
                    let path = '';
                    parts.forEach(part => {
                        path = path ? `${path}/${part}` : part;
                        folderPaths.add(path);
                    });
                });
                
                const foldersState = {};
                folderPaths.forEach(path => {
                    foldersState[path] = false;
                });
                setOpenFolders(foldersState);
            }
        } catch (err) {
            console.error("Error fetching files", err);
            toast.error("Failed to fetch files");
        }
    };

    const toggleFolder = (folderPath) => {
        setOpenFolders(prev => ({
            ...prev,
            [folderPath]: !prev[folderPath]
        }));
    };

    const toggleFileSelection = (fileId) => {
        if (selectedFileIds.includes(fileId)) {
            setSelectedFileIds(prev => prev.filter(id => id !== fileId));
        } else {
            setSelectedFileIds(prev => [...prev, fileId]);
        }
    };

    // Build a folder hierarchy tree from the flat list of files
    const buildFolderTree = () => {
        const tree = { name: 'root', children: {}, files: [] };
        
        files.forEach(file => {
            const folderPath = file.folder_name;
            const pathParts = folderPath.split('/').filter(Boolean);
            
            let current = tree;
            
            // Navigate the tree
            for (let i = 0; i < pathParts.length; i++) {
                const part = pathParts[i];
                const fullPath = pathParts.slice(0, i + 1).join('/');
                
                if (!current.children[part]) {
                    current.children[part] = {
                        name: part,
                        path: fullPath,
                        children: {},
                        files: []
                    };
                }
                
                current = current.children[part];
            }
            
            // Add file to the current folder
            current.files.push(file);
        });
        
        return tree;
    };

    const handleInputChange = (e) => {
        setInputMessage(e.target.value);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!inputMessage.trim()) return;

        setMessages(prev => [...prev, { content: inputMessage, sender: "user" }]);
        const messageToProcess = inputMessage;
        setInputMessage('');

        // Reset scroll state when a new message is sent
        setShouldAutoScroll(true);
        setIsUserScrolling(false);

        await sendChatMessage(messageToProcess);
    };

    const components = {
        table: ({ node, ...props }) => (
            <div className="table-container">
                <table className="markdown-table" {...props} />
            </div>
        ),
        thead: ({ node, ...props }) => <thead className="markdown-thead" {...props} />,
        tbody: ({ node, ...props }) => <tbody className="markdown-tbody" {...props} />,
        tr: ({ node, ...props }) => <tr className="markdown-tr" {...props} />,
        th: ({ node, ...props }) => <th className="markdown-th" {...props} />,
        td: ({ node, ...props }) => <td className="markdown-td" {...props} />
    };

    const sendChatMessage = async (query) => {
        setIsLoading(true);
        const tempId = Date.now();

        // Temporary loading message
        setMessages(prev => [...prev, { id: tempId, content: '', sender: 'system', streaming: true }]);

        try {
            const response = await fetch(CHAT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query,
                    user_id: "11111111-1111-1111-1111-111111111111",
                    query_id: "query_1",
                    file_id_list: selectedFileIds,
                    stream: true
                })
            });

            if (!response.ok) throw new Error("Network response was not ok");

            // Check if it's a stream or not
            const contentType = response.headers.get('Content-Type');
            const isStream = true;

            if (isStream) {
                const reader = response.body.getReader();
                const decoder = new TextDecoder("utf-8");

                let currentContent = '';

                const updateMessage = async (text) => {
                    const chunkSize = 10;
                    for (let i = 0; i < text.length; i += chunkSize) {
                        const chunk = text.substring(i, i + chunkSize);
                        currentContent += chunk;

                        setMessages(prev => {
                            const updated = [...prev];
                            const last = updated[updated.length - 1];
                            if (last?.streaming) {
                                updated[updated.length - 1] = { ...last, content: currentContent };
                            }
                            return updated;
                        });

                        await new Promise(resolve => setTimeout(resolve, 0));
                    }
                };

                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value, { stream: true });
                    await updateMessage(chunk);
                }

                // Finalize streaming message
                setMessages(prev => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last?.streaming) {
                        updated[updated.length - 1] = { ...last, streaming: false, content: currentContent };
                    }
                    return updated;
                });

            } else {
                // Non-streaming JSON response
                const data = await response.json();
                const content = data.final_response || "No result found.";

                setMessages(prev => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last?.streaming) {
                        updated[updated.length - 1] = { ...last, streaming: false, content };
                    }
                    return updated;
                });
            }

        } catch (error) {
            setMessages(prev => [...prev, { content: `An error occurred: ${error.message}`, sender: "system" }]);
            toast.error("Failed to send message");
        } finally {
            setIsLoading(false);
        }
    };

    // Recursive component to render folders and subfolders
    const RenderFolder = ({ folder, level = 0 }) => {
        const folderKeys = Object.keys(folder.children);
        return (
            <>
                {folderKeys.map(key => {
                    const childFolder = folder.children[key];
                    return (
                        <div key={childFolder.path} className="folder" style={{ marginLeft: `${level * 16}px` }}>
                            <div className="folder-header" onClick={() => toggleFolder(childFolder.path)}>
                                <ChevronRight 
                                    className={`folder-icon ${openFolders[childFolder.path] ? 'open' : ''}`} 
                                    size={16} 
                                />
                                <FolderOpen size={16} />
                                <span className="folder-name">{childFolder.name}</span>
                            </div>

                            {openFolders[childFolder.path] && (
                                <div className="folder-content">
                                    <RenderFolder folder={childFolder} level={level + 1} />
                                    
                                    {childFolder.files.map(file => {
                                        const fileName = file.file_name.split('/').pop();
                                        return (
                                            <div 
                                                key={file.file_id} 
                                                className="file-item"
                                                style={{ marginLeft: `${(level + 1) * 16}px` }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="file-checkbox"
                                                    checked={selectedFileIds.includes(file.file_id)}
                                                    onChange={() => toggleFileSelection(file.file_id)}
                                                />
                                                <File size={14} />
                                                <span className="file-name">{fileName}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </>
        );
    };

    const folderTree = buildFolderTree();

    return (
        <div className='chat-section'>
            <ToastContainer position="top-right" autoClose={2000} hideProgressBar />

            <div className="chat-layout">
                <div className="left-panel">
                    <h3>Available Files</h3>
                    {files.length === 0 && <p>Loading files...</p>}

                    <div className="folders-container">
                        <RenderFolder folder={folderTree} />
                    </div>
                </div>

                <div className="right-panel">
                    <div className="chat-header">
                        <h1>Document Analysis</h1>
                        <h2>Get Insights</h2>
                    </div>

                    <div className="chat-app">
                        <div className="chat-messages" ref={chatContainerRef}>
                            {messages.map((msg, index) => (
                                <div key={index} className={`message ${msg.sender === 'user' ? 'user-message' : 'system-message'}`}>
                                    {msg.sender === 'system' && (
                                        <div className="bot-icon">
                                            <FaRobot size={20} color="#d4076a" />
                                        </div>
                                    )}
                                    <div className="message-content">
                                        {msg.streaming && msg.content === '' ? (
                                            <div className="loading-indicator">
                                                <PulseLoader color="#d4076a" size={10} />
                                            </div>
                                        ) : (
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm, remarkGemoji]}
                                                components={components}
                                            >
                                                {msg.content}
                                            </ReactMarkdown>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <form className="chat-input" onSubmit={handleSubmit}>
                            <input
                                type="text"
                                value={inputMessage}
                                onChange={handleInputChange}
                                placeholder="Type your message..."
                                disabled={isLoading}
                            />
                            <button type="submit" disabled={isLoading || !inputMessage.trim()} className="send-button">
                                <Send size={20} />
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Section;