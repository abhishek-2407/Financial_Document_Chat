import React, { useState, useEffect, useRef } from 'react';
import './Section.css';
import { Send, ChevronRight, FolderOpen } from 'lucide-react';
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
    const [selectedFolderName, setSelectedFolderName] = useState('');
    const chatContainerRef = useRef(null);
    const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
    const [isUserScrolling, setIsUserScrolling] = useState(false);
    const userScrollTimerRef = useRef(null);

    const CHAT_URL = `${ApiUrl}/doc-eval/chat`;
    const FILES_URL = `${ApiUrl}/doc-eval/get-final-files`;

    useEffect(() => {
        setMessages([
            {
                content: "Welcome to Agentic Customer Support!\nI can help with all the FAQs related to 'Hack the Future' and many more domain. Please check top right corner to know about me.",
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
            const threshold = 50;
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
                const folders = {};
                data.data.forEach(file => {
                    folders[file.folder_name] = false;
                });
                setOpenFolders(folders);
            }
        } catch (err) {
            console.error("Error fetching files", err);
        }
    };

    const toggleFolder = (folderName) => {
        setOpenFolders(prev => ({
            ...prev,
            [folderName]: !prev[folderName]
        }));
    };

    const toggleFileSelection = (fileId) => {
        const file = files.find(f => f.file_id === fileId);
        const folderName = file.folder_name;

        if (selectedFileIds.includes(fileId)) {
            const updatedFileIds = selectedFileIds.filter(id => id !== fileId);
            if (updatedFileIds.length === 0) {
                setSelectedFileIds([]);
                setSelectedFolderName('');
            } else {
                setSelectedFileIds(updatedFileIds);
            }
        } else {
            if (selectedFileIds.length === 0) {
                setSelectedFileIds([fileId]);
                setSelectedFolderName(folderName);
            } else {
                if (folderName === selectedFolderName) {
                    setSelectedFileIds([...selectedFileIds, fileId]);
                } else {
                    toast.error("You can only select files from the same folder.");
                }
            }
        }
    };

    const getFolders = () => {
        const folders = {};
        files.forEach(file => {
            if (!folders[file.folder_name]) {
                folders[file.folder_name] = [];
            }
            folders[file.folder_name].push(file);
        });
        return folders;
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

        setMessages(prev => [...prev, { id: tempId, content: '', sender: 'system', streaming: true }]);

        try {
            const response = await fetch(CHAT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query,
                    ticket_id: selectedFolderName,
                    user_id: "11111111-1111-1111-1111-111111111111",
                    query_id: "query_1",
                    file_id_list: selectedFileIds,
                    stream: true
                })
            });

            if (!response.ok || !response.body) throw new Error("Stream error or empty body");

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");

            let fullResponse = '';
            let currentContent = '';

            const updateMessage = async (text) => {
                for (let i = 0; i < text.length; i++) {
                    currentContent += text[i];

                    setMessages(prev => {
                        const updated = [...prev];
                        const last = updated[updated.length - 1];
                        if (last && last.streaming) {
                            updated[updated.length - 1] = { ...last, content: currentContent };
                        }
                        return updated;
                    });

                    await new Promise(resolve => setTimeout(resolve, 1));
                }
            };

           


            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                fullResponse += chunk;
                await updateMessage(chunk);
            }

            setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.streaming) {
                    updated[updated.length - 1] = { ...last, streaming: false, content: currentContent };
                }
                return updated;
            });

        } catch (error) {
            setMessages(prev => [...prev, { content: `An error occurred: ${error.message}`, sender: "system" }]);
        } finally {
            setIsLoading(false);
        }
    };

    const folders = getFolders();

    return (
        <div className='chat-section'>
            <ToastContainer position="top-right" autoClose={2000} hideProgressBar />

            <div className="chat-layout">
                <div className="left-panel">
                    <h3>Available Files</h3>
                    {files.length === 0 && <p>Loading files...</p>}

                    <div className="folders-container">
                        {Object.keys(folders).map(folderName => (
                            <div key={folderName} className="folder">
                                <div className="folder-header" onClick={() => toggleFolder(folderName)}>
                                    <ChevronRight className={`folder-icon ${openFolders[folderName] ? 'open' : ''}`} size={16} />
                                    <FolderOpen size={16} />
                                    <span className="folder-name">{folderName}</span>
                                </div>

                                <div className={`folder-files ${openFolders[folderName] ? 'open' : ''}`}>
                                    {folders[folderName].map(file => {
                                        const fileName = file.file_name.split('/').pop();
                                        return (
                                            <div key={file.file_id} className="file-item">
                                                <input
                                                    type="checkbox"
                                                    className="file-checkbox"
                                                    checked={selectedFileIds.includes(file.file_id)}
                                                    onChange={() => toggleFileSelection(file.file_id)}
                                                />
                                                <span className="file-name">{fileName}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
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
                                        {msg.loading ? (
                                            <PulseLoader color="#d4076a" size={10} />
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