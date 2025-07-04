import React, { useState, useRef, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

// Main App component for the YOLO Image Tagger
const App = () => {
    // State to manage the list of images, including their data, URL, and annotations
    const [images, setImages] = useState([]);
    // State to track the index of the currently displayed image
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    // State to manage the list of defined classes
    const [classes, setClasses] = useState(['13','mega','chv','tvno', 'marcador_futbol', 'tiempo_futbol']); // Initial example classes
    // State to hold the currently selected class for new annotations
    const [selectedClass, setSelectedClass] = useState('');
    // State to track if a bounding box is currently being drawn
    const [isDrawing, setIsDrawing] = useState(false);
    // State to store the starting point of the current drawing action
    const [startPoint, setStartPoint] = useState({ x: 0, y: 0 });
    // State to store the dimensions of the box being drawn in real-time
    const [currentDrawingBox, setCurrentDrawingBox] = useState(null);
    // Ref to the canvas element for drawing operations
    const canvasRef = useRef(null);
    // Ref to the image element to get its natural dimensions
    const imageRef = useRef(null);
    // State to manage the history of annotations for undo/redo functionality
    const [history, setHistory] = useState([]);
    // State to track the current position in the history stack
    const [historyIndex, setHistoryIndex] = useState(-1);
    // State for a new class input field
    const [newClass, setNewClass] = useState('');
    // State for managing messages to the user (e.g., success, error)
    const [message, setMessage] = useState({ text: '', type: '' }); // {text: '...', type: 'success' | 'error'}
    const [exportFormat, setExportFormat] = useState("txt"); // "coco" | "txt"

    

    // Effect to set the initial selected class when classes are loaded or updated
    useEffect(() => {
        if (classes.length > 0 && !selectedClass) {
            setSelectedClass(classes[0]);
        }
    }, [classes, selectedClass]);

    // Effect to draw annotations on the canvas whenever the image or annotations change
    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        const img = imageRef.current;

        if (!canvas || !ctx || !img || !images[currentImageIndex]) {
            return;
        }

        // Ensure image is loaded before drawing
        if (!img.complete) {
            img.onload = () => drawImageAndAnnotations(ctx, img, images[currentImageIndex].annotations);
        } else {
            drawImageAndAnnotations(ctx, img, images[currentImageIndex].annotations);
        }

        // Resize canvas to fit the image
        const resizeCanvas = () => {
            if (img.naturalWidth && img.naturalHeight) {
                const aspectRatio = img.naturalWidth / img.naturalHeight;
                const maxWidth = img.parentElement.clientWidth;
                const maxHeight = window.innerHeight * 0.7; // Limit height to prevent overflow

                let displayWidth = maxWidth;
                let displayHeight = maxWidth / aspectRatio;

                if (displayHeight > maxHeight) {
                    displayHeight = maxHeight;
                    displayWidth = maxHeight * aspectRatio;
                }

                canvas.width = displayWidth;
                canvas.height = displayHeight;
                canvas.style.width = `${displayWidth}px`;
                canvas.style.height = `${displayHeight}px`;

                drawImageAndAnnotations(ctx, img, images[currentImageIndex].annotations);
            }
        };

        window.addEventListener('resize', resizeCanvas);
        resizeCanvas(); // Initial resize

        return () => {
            window.removeEventListener('resize', resizeCanvas);
        };
    }, [currentImageIndex, images, currentDrawingBox]); // Re-run when image, index, or drawing box changes

    // Function to draw the image and all its annotations on the canvas
    const drawImageAndAnnotations = useCallback((ctx, img, annotations) => {
        if (!ctx || !img || !canvasRef.current) return;

        const canvas = canvasRef.current;
        ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear canvas

        // Draw the image scaled to fit the canvas
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Draw existing bounding boxes
        annotations.forEach(annotation => {
            const { bbox, class: className } = annotation;
            const [x, y, width, height] = bbox;

            // Scale coordinates from natural image size to canvas size
            const scaleX = canvas.width / img.naturalWidth;
            const scaleY = canvas.height / img.naturalHeight;

            const scaledX = x * scaleX;
            const scaledY = y * scaleY;
            const scaledWidth = width * scaleX;
            const scaledHeight = height * scaleY;

            ctx.strokeStyle = '#FF0000'; // Red color for bounding box
            ctx.lineWidth = 2;
            ctx.strokeRect(scaledX, scaledY, scaledWidth, scaledHeight);

            ctx.fillStyle = '#FF0000'; // Red background for text
            const fontSize = Math.max(10, Math.min(20, scaledHeight / 5)); // Responsive font size
            ctx.font = `${fontSize}px Arial`;
            ctx.fillText(className, scaledX + 5, scaledY + fontSize + 5); // Label inside the box
        });

        // Draw the box currently being drawn by the user
        if (currentDrawingBox) {
            const { x, y, width, height } = currentDrawingBox;
            ctx.strokeStyle = '#00FF00'; // Green color for the current drawing box
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, width, height);
        }
    }, [currentDrawingBox]);

    // Function to add a new state to the history stack for undo/redo
    const addHistory = useCallback((newAnnotations) => {
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(newAnnotations);
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
    }, [history, historyIndex]);

    // Handle image file selection/upload
    const handleImageUpload = (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        const newImages = files.map(file => ({
            id: uuidv4(), // Use object URL as a temporary ID
            file: file,
            url: URL.createObjectURL(file),
            annotations: [],
            width: 0, // Will be updated after image loads
            height: 0, // Will be updated after image loads
        }));

        setImages(prevImages => [...prevImages, ...newImages]);
        // Set current image to the first newly uploaded image if no images were present before
        if (images.length === 0) {
            setCurrentImageIndex(0);
        }
        setMessage({ text: `Uploaded ${files.length} image(s).`, type: 'success' });
    };

    // Handle drag over event for file upload
    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
    };

    // Handle drop event for file upload
    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const files = Array.from(e.dataTransfer.files);
        if (files.length === 0) return;

        const newImages = files.map(file => ({
            id: uuidv4(), // Use object URL as a temporary ID
            file: file,
            url: URL.createObjectURL(file),
            annotations: [],
            width: 0,
            height: 0,
        }));

        setImages(prevImages => [...prevImages, ...newImages]);
        if (images.length === 0) {
            setCurrentImageIndex(0);
        }
        setMessage({ text: `Dropped ${files.length} image(s).`, type: 'success' });
    };

    // Callback when an image loads to get its natural dimensions
    const handleImageLoad = (e) => {
        const img = e.target;

        // Obtiene las dimensiones renderizadas en pantalla
        // const rect = img.getBoundingClientRect();
        // const displayWidth = rect.width;
        // const displayHeight = rect.height;

        // Ajusta el canvas para que coincida exactamente con el tamaño de la imagen visible
        const canvas = canvasRef.current;
        // if (canvas) {
        //     canvas.width = displayWidth;
        //     canvas.height = displayHeight;
        //     canvas.style.width = `${displayWidth}px`;
        //     canvas.style.height = `${displayHeight}px`;
        // }

        // Actualiza las dimensiones naturales de la imagen en el estado
        setImages(prevImages => {
            const updatedImages = [...prevImages];
            if (updatedImages[currentImageIndex]) {
                updatedImages[currentImageIndex].width = img.naturalWidth;
                updatedImages[currentImageIndex].height = img.naturalHeight;
            }
            return updatedImages;
        });

        // Redibuja la imagen y las anotaciones
        const ctx = canvas?.getContext('2d');
        if (ctx && img && images[currentImageIndex]) {
            drawImageAndAnnotations(ctx, img, images[currentImageIndex]?.annotations || []);
        }
    };

    // Mouse down event handler for drawing bounding boxes
    const handleMouseDown = (e) => {
        if (!selectedClass || !images[currentImageIndex]) {
            setMessage({ text: 'Please select a class before drawing.', type: 'error' });
            return;
        }
        setIsDrawing(true);
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setStartPoint({ x, y });
        setCurrentDrawingBox({ x, y, width: 0, height: 0 });
    };

    // Mouse move event handler for drawing bounding boxes
    const handleMouseMove = (e) => {
        if (!isDrawing) return;

        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const newX = Math.min(startPoint.x, x);
        const newY = Math.min(startPoint.y, y);
        const width = Math.abs(x - startPoint.x);
        const height = Math.abs(y - startPoint.y);

        setCurrentDrawingBox({ x: newX, y: newY, width, height });

        // Redraw canvas with the current drawing box
        const ctx = canvas.getContext('2d');
        const img = imageRef.current;
        if (ctx && img && images[currentImageIndex]) {
            drawImageAndAnnotations(ctx, img, images[currentImageIndex].annotations);
        }
    };

    // Mouse up event handler for drawing bounding boxes
    const handleMouseUp = () => {
        if (!isDrawing) return;
        setIsDrawing(false);

        if (!currentDrawingBox || currentDrawingBox.width === 0 || currentDrawingBox.height === 0) {
            setCurrentDrawingBox(null); // Clear if no box was drawn
            return;
        }

        const canvas = canvasRef.current;
        const img = imageRef.current;
        if (!canvas || !img || !images[currentImageIndex]) return;

        // Scale coordinates from canvas size back to natural image size
        const scaleX = img.naturalWidth / canvas.width;
        const scaleY = img.naturalHeight / canvas.height;

        const naturalX = currentDrawingBox.x * scaleX;
        const naturalY = currentDrawingBox.y * scaleY;
        const naturalWidth = currentDrawingBox.width * scaleX;
        const naturalHeight = currentDrawingBox.height * scaleY;

        const newAnnotation = {
            id: uuidv4(),
            class: selectedClass,
            bbox: [naturalX, naturalY, naturalWidth, naturalHeight],
        };

        setImages(prevImages => {
            const updatedImages = [...prevImages];
            const currentImage = updatedImages[currentImageIndex];
            const newAnnotations = [...currentImage.annotations, newAnnotation];
            currentImage.annotations = newAnnotations;
            addHistory(newAnnotations); // Add to history
            return updatedImages;
        });

        setCurrentDrawingBox(null); // Clear the drawing box
    };

    // Undo the last annotation action
    const handleUndo = () => {
        if (historyIndex > 0) {
            const prevAnnotations = history[historyIndex - 1];
            setImages(prevImages => {
                const updatedImages = [...prevImages];
                updatedImages[currentImageIndex].annotations = prevAnnotations;
                return updatedImages;
            });
            setHistoryIndex(prevIndex => prevIndex - 1);
        } else if (historyIndex === 0) {
            // If at the first state, clear all annotations
            setImages(prevImages => {
                const updatedImages = [...prevImages];
                updatedImages[currentImageIndex].annotations = [];
                return updatedImages;
            });
            setHistoryIndex(-1); // No history left
        }
    };

    // Redo the last undone annotation action
    const handleRedo = () => {
        if (historyIndex < history.length - 1) {
            const nextAnnotations = history[historyIndex + 1];
            setImages(prevImages => {
                const updatedImages = [...prevImages];
                updatedImages[currentImageIndex].annotations = nextAnnotations;
                return updatedImages;
            });
            setHistoryIndex(prevIndex => prevIndex + 1);
        }
    };

    // Delete a specific annotation by its ID
    const handleDeleteAnnotation = (annotationId) => {
        setImages(prevImages => {
            const updatedImages = [...prevImages];
            const currentImage = updatedImages[currentImageIndex];
            const newAnnotations = currentImage.annotations.filter(ann => ann.id !== annotationId);
            currentImage.annotations = newAnnotations;
            addHistory(newAnnotations); // Add to history
            return updatedImages;
        });
    };

    // Add a new class to the list
    const handleAddClass = () => {
        if (newClass.trim() && !classes.includes(newClass.trim())) {
            setClasses(prevClasses => [...prevClasses, newClass.trim()]);
            setSelectedClass(newClass.trim()); // Automatically select the new class
            setNewClass('');
            setMessage({ text: `Class '${newClass.trim()}' added.`, type: 'success' });
        } else if (classes.includes(newClass.trim())) {
            setMessage({ text: `Class '${newClass.trim()}' already exists.`, type: 'error' });
        }
    };

    // Navigate to the previous image
    const handlePrevImage = () => {
        if (currentImageIndex > 0) {
            setCurrentImageIndex(prevIndex => prevIndex - 1);
            setHistory([]); // Reset history for new image
            setHistoryIndex(-1);
        }
    };

    // Navigate to the next image
    const handleNextImage = () => {
        if (currentImageIndex < images.length - 1) {
            setCurrentImageIndex(prevIndex => prevIndex + 1);
            setHistory([]); // Reset history for new image
            setHistoryIndex(-1);
        }
    };

    const handleExport = () => {
        if (images.length === 0) return;

        if (exportFormat === "coco") {
        handleExportCoco();   // existing function
        } else {
        handleExportTxt();    // existing function
        }
    };

    // Export data to COCO JSON format and trigger download
    const handleExportCoco = async () => {
        if (images.length === 0) {
            setMessage({ text: 'No images to export.', type: 'error' });
            return;
        }
        setMessage({ text: 'Preparing COCO dataset…', type: 'info' });

        try {
            /* ------------------------- 3.1 build JSON --------------------- */
            const categories = classes.map((cls, i) => ({
            id: i + 1,
            name: cls,
            supercategory: 'none',
            }));

            const coco = {
            info: {
                description: 'YOLO Image Tagger Dataset',
                version: '1.0',
                year:  new Date().getFullYear(),
                date_created: new Date().toISOString(),
            },
            licenses : [{ id: 1, name: 'Custom License', url: '' }],
            images   : [],
            annotations: [],
            categories,
            };

            let annotationId = 1;

            images.forEach((img, idx) => {
            // --- image entry
            coco.images.push({
                id        : idx + 1,
                width     : img.width,
                height    : img.height,
                file_name : img.file.name,
                license   : 1,
            });

            // --- annotation entries
            img.annotations.forEach(ann => {
                const cat = categories.find(c => c.name === ann.class);
                if (!cat) return;   // skip unknown class

                const [x, y, w, h] = ann.bbox; // absolute pixel coords
                coco.annotations.push({
                id          : annotationId++,
                image_id    : idx + 1,
                category_id : cat.id,
                bbox        : [x, y, w, h],
                area        : w * h,
                iscrowd     : 0,
                });
            });
            });

            /* ------------------------- 3.2 build ZIP ----------------------- */
            const zip = new JSZip();
            zip.file('annotations.json', JSON.stringify(coco, null, 2));

            for (const img of images) {
            zip.file(img.file.name, img.file); // keep original name & data
            }

            /* ------------------------- 3.3 trigger download --------------- */
            const blob = await zip.generateAsync({ type: 'blob' });
            saveAs(blob, 'coco_dataset.zip');

            setMessage({ text: 'COCO dataset exported successfully!', type: 'success' });
        } catch (err) {
            console.error('COCO export failed:', err);
            setMessage({ text: `COCO export failed: ${err.message}`, type: 'error' });
        }
        };

    const handleExportTxt = async () => {
        if (images.length === 0) {
            setMessage({ text: 'No images to export.', type: 'error' });
            return;
        }

        setMessage({ text: 'Preparing YOLO TXT data for export…', type: 'info' });

        try {
            const zip = new JSZip();
            const classMap = new Map(classes.map((cls, i) => [cls, i])); // name -> id

            // classes.txt (optional but handy)
            zip.file('classes.txt', classes.join('\n'));

            const usedClassSet = new Set();
            // process every image
            for (const img of images) {
                // 1. produce the .txt content
                const labelLines = img.annotations.map(ann => {
                    const id = classMap.get(ann.class);
                    if (id === undefined) return ''; // skip unknown 
                    usedClassSet.add(ann.class);
                    const [x, y, w, h] = ann.bbox;   // absolute pixel coords
                    // YOLO wants centre-coords & size NORMALISED (0-1)
                    const xC = (x + w / 2) / img.width;
                    const yC = (y + h / 2) / img.height;
                    const wN =  w          / img.width;
                    const hN =  h          / img.height;
                    return `${id} ${xC} ${yC} ${wN} ${hN}`;
                }).filter(Boolean).join('\n');

                // 2. add the label file to zip
                const baseName = img.file.name.replace(/\.[^/.]+$/, '');
                zip.folder("labels").file(`${baseName}.txt`, labelLines);

                // 3. add the image itself
                zip.folder("images").file(img.file.name, img.file);
            }
            const usedClasses = Array.from(usedClassSet);
            const nc = usedClasses.length;
            const yamlContent =
            `train: ../train/images
            
            
nc: ${nc}
names: [${usedClasses.map(cls => `'${cls}'`).join(', ')}]
            `;
            zip.file('data.yaml', yamlContent);
            // 4. generate and download
            const blob = await zip.generateAsync({ type: 'blob' });
            saveAs(blob, 'yolo_txt_dataset.zip');

            setMessage({ text: 'YOLO TXT dataset exported successfully!', type: 'success' });
        } catch (err) {
            console.error('YOLO TXT export failed:', err);
            setMessage({ text: `YOLO TXT export failed: ${err.message}`, type: 'error' });
        }
        };

    const currentImage = images[currentImageIndex];
    const currentAnnotations = currentImage ? currentImage.annotations : [];

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col font-inter">
            {/* Header */}
            <header className="bg-gradient-to-r from-blue-600 to-purple-700 text-white p-4 shadow-lg">
                <h1 className="text-3xl font-bold text-center">YOLO Image Tagger</h1>
            </header>

            {/* Message Display */}
            {message.text && (
                <div className={`p-3 text-center rounded-md mx-auto mt-4 w-11/12 md:w-3/4 lg:w-1/2 shadow-md
                    ${message.type === 'success' ? 'bg-green-100 text-green-800' :
                      message.type === 'error' ? 'bg-red-100 text-red-800' :
                      'bg-blue-100 text-blue-800'}`}>
                    {message.text}
                </div>
            )}

            <main className="flex flex-col lg:flex-row flex-grow p-4 gap-4">
                {/* Left Panel: Image Upload & Navigation */}
                <div className="lg:w-1/4 bg-white p-6 rounded-xl shadow-lg flex flex-col space-y-6">
                    <h2 className="text-2xl font-semibold text-gray-800 mb-4">Manage Images</h2>

                    {/* Image Upload Area */}
                    <div
                        className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-500 transition-colors"
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        onClick={() => document.getElementById('fileInput').click()}
                    >
                        <input
                            type="file"
                            id="fileInput"
                            multiple
                            accept="image/*"
                            onChange={handleImageUpload}
                            className="hidden"
                        />
                        <p className="text-gray-600">Drag & drop images here, or click to select</p>
                        <p className="text-sm text-gray-500 mt-1">(Supports multiple images)</p>
                    </div>

                    {/* Image Navigation */}
                    {images.length > 0 && (
                        <div className="flex justify-between items-center mt-4">
                            <button
                                onClick={handlePrevImage}
                                disabled={currentImageIndex === 0}
                                className="px-5 py-2 bg-blue-500 text-white rounded-md shadow-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Previous
                            </button>
                            <span className="text-lg font-medium text-gray-700">
                                {currentImageIndex + 1} / {images.length}
                            </span>
                            <button
                                onClick={handleNextImage}
                                disabled={currentImageIndex === images.length - 1}
                                className="px-5 py-2 bg-blue-500 text-white rounded-md shadow-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Next
                            </button>
                        </div>
                    )}

                    {/* Class Management */}
                    <div className="mt-6">
                        <h3 className="text-xl font-semibold text-gray-800 mb-3">Manage Classes</h3>
                        <div className="flex gap-2 mb-3">
                            <input
                                type="text"
                                value={newClass}
                                onChange={(e) => setNewClass(e.target.value)}
                                placeholder="New class name"
                                className="flex-grow p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            />
                            <button
                                onClick={handleAddClass}
                                className="px-4 py-2 bg-green-500 text-white rounded-md shadow-md hover:bg-green-600 transition-colors"
                            >
                                Add
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {classes.map(cls => (
                                <button
                                    key={cls}
                                    onClick={() => setSelectedClass(cls)}
                                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all
                                        ${selectedClass === cls
                                            ? 'bg-purple-600 text-white shadow-lg'
                                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                        }`}
                                >
                                    {cls}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* -------------------------------------------------------------- */}
                    {/* 3.  FORMAT SELECTOR                                            */}
                    {/* -------------------------------------------------------------- */}
                    <select
                        value={exportFormat}
                        onChange={(e) => setExportFormat(e.target.value)}
                        className="px-4 py-2 bg-gray-800 text-white rounded-md shadow-md"
                    >
                        <option value="txt">YOLO TXT (labels + images)</option>
                        <option value="coco">COCO (JSON + images)</option>
                        
                    </select>

                    {/* -------------------------------------------------------------- */}
                    {/* 4.  SINGLE EXPORT BUTTON                                       */}
                    {/* -------------------------------------------------------------- */}
                    <button
                        onClick={handleExport}
                        disabled={images.length === 0}
                        className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-700
                                text-white text-lg font-semibold rounded-lg shadow-xl
                                hover:from-purple-700 hover:to-indigo-800
                                disabled:opacity-50 disabled:cursor-not-allowed
                                transition-all transform hover:scale-105"
                    >
                        Export
                    </button>
                </div>

                {/* Center Panel: Image Display and Canvas */}
                <div className="lg:w-2/4 bg-white p-6 rounded-xl shadow-lg flex flex-col items-center justify-center relative">
                    {currentImage ? (
                        <>
                            <h2 className="text-2xl font-semibold text-gray-800 mb-4">{currentImage.file.name}</h2>
                            <div className="relative w-full max-w-full h-auto flex justify-center items-center overflow-hidden rounded-lg border border-gray-300">
                                <img
                                    ref={imageRef}
                                    src={currentImage.url}
                                    alt="Image for Tagging"
                                    className="block max-w-full max-h-[70vh] object-contain grow"
                                    onLoad={handleImageLoad}
                                />
                                <canvas
                                    ref={canvasRef}
                                    className="absolute top-0 left-0 cursor-crosshair"
                                    onMouseDown={handleMouseDown}
                                    onMouseMove={handleMouseMove}
                                    onMouseUp={handleMouseUp}
                                    onMouseLeave={handleMouseUp} // End drawing if mouse leaves canvas
                                ></canvas>
                            </div>
                            <div className="flex gap-4 mt-4">
                                <button
                                    onClick={handleUndo}
                                    disabled={historyIndex <= 0 && currentAnnotations.length === 0}
                                    className="px-5 py-2 bg-yellow-500 text-white rounded-md shadow-md hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    Undo
                                </button>
                                <button
                                    onClick={handleRedo}
                                    disabled={historyIndex >= history.length - 1}
                                    className="px-5 py-2 bg-orange-500 text-white rounded-md shadow-md hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    Redo
                                </button>
                            </div>
                        </>
                    ) : (
                        <p className="text-gray-500 text-xl">Upload images to start tagging!</p>
                    )}
                </div>

                {/* Right Panel: Annotation List */}
                <div className="lg:w-1/4 bg-white p-6 rounded-xl shadow-lg flex flex-col">
                    <h2 className="text-2xl font-semibold text-gray-800 mb-4">Annotations</h2>
                    <p className="text-sm text-gray-600 mb-4">Current Class: <span className="font-bold text-purple-600">{selectedClass || 'None Selected'}</span></p>

                    {currentImage && currentAnnotations.length > 0 ? (
                        <ul className="space-y-3 overflow-y-auto max-h-[calc(100vh-250px)] pr-2">
                            {currentAnnotations.map((ann, index) => (
                                <li key={ann.id} className="bg-gray-50 p-3 rounded-md border border-gray-200 flex justify-between items-center shadow-sm">
                                    <div>
                                        <p className="font-medium text-gray-800">{ann.class}</p>
                                        <p className="text-sm text-gray-600">
                                            [{ann.bbox[0].toFixed(1)}, {ann.bbox[1].toFixed(1)}, {ann.bbox[2].toFixed(1)}, {ann.bbox[3].toFixed(1)}]
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => handleDeleteAnnotation(ann.id)}
                                        className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                                        title="Delete Annotation"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm6 0a1 1 0 01-2 0v6a1 1 0 112 0V8z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-gray-500">No annotations for this image yet.</p>
                    )}
                </div>
            </main>
        </div>
    );
};

export default App;