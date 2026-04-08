import React, { useState, useEffect, useRef } from 'react';
import { Bot, User, Copy, Check, Volume2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const MessageBubble = ({ message, onTypingComplete }) => {
    const [copied, setCopied] = useState(false);
    const [displayedContent, setDisplayedContent] = useState('');
    const isAI = message.role === 'ai';
    const shouldAnimate = message.shouldAnimate && isAI;
    const hasAnimatedRef = useRef(false);

    useEffect(() => {
        let isMounted = true;

        if (!shouldAnimate) {
            setDisplayedContent(message.content);
            if (isAI && onTypingComplete) {
                onTypingComplete();
            }
            return;
        }

        if (hasAnimatedRef.current) {
            // If already animated once, just ensure full content is shown
            setDisplayedContent(message.content);
            return;
        }

        let currentIndex = 0;
        const fullText = message.content;
        setDisplayedContent('');

        const typeChar = () => {
            if (!isMounted) return;

            setDisplayedContent(fullText.slice(0, currentIndex + 1));
            currentIndex++;

            if (currentIndex < fullText.length) {
                // Random delay between 15ms and 30ms
                const delay = Math.floor(Math.random() * (30 - 15 + 1) + 15);
                setTimeout(typeChar, delay);
            } else {
                hasAnimatedRef.current = true;
                if (onTypingComplete) {
                    onTypingComplete();
                }
            }
        };

        // Start typing
        typeChar();

        return () => { isMounted = false; };

    }, [message.content, shouldAnimate, isAI]);

    // Update displayed content if message content changes externally (and not animating)
    useEffect(() => {
        if (!shouldAnimate) {
            setDisplayedContent(message.content);
        }
    }, [message.content, shouldAnimate]);


    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(message.content);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy text:', err);
        }
    };

    const handleReadAloud = () => {
        if (!('speechSynthesis' in window)) return;
        const utterance = new SpeechSynthesisUtterance(message.content.replace(/[#*]/g, ''));
        window.speechSynthesis.speak(utterance);
    };

    return (
        <div className={`message ${message.role}`}>
            <div className={`avatar ${message.role}`}>
                {isAI ? <Bot size={20} /> : <User size={20} />}
            </div>
            <div className="message-content group">
                {isAI ? (
                    <div className="react-markdown-container">
                        <ReactMarkdown>{displayedContent}</ReactMarkdown>
                    </div>
                ) : (
                    displayedContent.split('\n').map((line, i) => (
                        <p key={i}>{line}</p>
                    ))
                )}

                {message.image_data && (
                    <div className="message-image-container" style={{ marginTop: '10px' }}>
                        <img 
                            src={message.image_data + (message.image_data.includes('pollinations.ai') ? `?nologo=true&seed=${Math.floor(Math.random() * 100000)}` : '')} 
                            alt="Generated content" 
                            className="generated-image" 
                            style={{ maxWidth: '100%', borderRadius: '8px', display: 'block', minHeight: '200px', backgroundColor: 'rgba(0,0,0,0.1)' }}
                            onLoad={(e) => {
                                e.target.style.minHeight = 'auto';
                            }}
                            onError={(e) => {
                                e.target.onerror = null; 
                                e.target.src = 'https://via.placeholder.com/400x300?text=Image+Load+Error';
                            }}
                        />
                    </div>
                )}

                {isAI && (
                    <div className="message-actions">
                        <button
                            className="copy-btn"
                            onClick={handleReadAloud}
                            title="Read aloud"
                        >
                            <Volume2 size={14} /> Listen
                        </button>
                        <button
                            className="copy-btn"
                            onClick={handleCopy}
                            title="Copy to clipboard"
                        >
                            {copied ? <Check size={14} /> : <Copy size={14} />}
                            {copied ? 'Copied' : 'Copy'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MessageBubble;
