async function processFiles(files) {
    const resultsDiv = document.getElementById('results');
    const loadingDiv = document.getElementById('loading');
    resultsDiv.innerHTML = '';
    loadingDiv.style.display = 'block';
    const progressBarContainer = document.getElementById('progressBarContainer');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    let showProgress = files.length > 1;
    if (showProgress) {
        progressBarContainer.style.display = 'block';
        progressBar.style.width = '0%';
        progressText.textContent = '0%';
    } else {
        progressBarContainer.style.display = 'none';
    }

    // ترتيب الملفات حسب الاسم لضمان الترتيب الصحيح
    files = files.sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: 'base'}));
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (showProgress) {
            let percent = Math.round(((i) / files.length) * 100);
            progressBar.style.width = percent + '%';
            progressText.textContent = percent + '%';
        }
        if (!file.type.startsWith('image/')) continue;
        const imgURL = URL.createObjectURL(file);
        const copyButtonDefaultLabel = 'نسخ النص';
        const editButtonDefaultLabel = 'تحرير النص';
        const saveButtonLabel = 'حفظ التعديلات';
        const resultBlock = document.createElement('div');
        resultBlock.className = 'result-block';
        resultBlock.innerHTML = `<strong>الصورة:</strong><br><img src="${imgURL}" style="max-width:100%;max-height:200px;"><br><div class="extracted-header"><strong>النص المستخرج:</strong><div class="copy-controls"><button type="button" class="action-button copy-button" disabled>${copyButtonDefaultLabel}</button><div class="font-controls"><button type="button" class="action-button font-button font-decrease" disabled>-</button><button type="button" class="action-button font-button font-increase" disabled>+</button></div><button type="button" class="action-button edit-button" disabled>${editButtonDefaultLabel}</button></div></div><pre class="extracted-text">جاري المعالجة...</pre>`;
        resultsDiv.appendChild(resultBlock);
        const copyButton = resultBlock.querySelector('.copy-button');
        const editButton = resultBlock.querySelector('.edit-button');
        const decreaseFontButton = resultBlock.querySelector('.font-decrease');
        const increaseFontButton = resultBlock.querySelector('.font-increase');
        const textElement = resultBlock.querySelector('.extracted-text');
        const MIN_FONT_SIZE = 12;
        const MAX_FONT_SIZE = 32;
        let currentFontSize = parseFloat(window.getComputedStyle(textElement).fontSize) || 16;

        const applyFontSize = () => {
            textElement.style.fontSize = `${currentFontSize}px`;
        };

        const updateFontButtons = () => {
            decreaseFontButton.disabled = currentFontSize <= MIN_FONT_SIZE;
            increaseFontButton.disabled = currentFontSize >= MAX_FONT_SIZE;
        };

        applyFontSize();

        decreaseFontButton.addEventListener('click', () => {
            if (currentFontSize <= MIN_FONT_SIZE) return;
            currentFontSize = Math.max(currentFontSize - 2, MIN_FONT_SIZE);
            applyFontSize();
            updateFontButtons();
        });

        increaseFontButton.addEventListener('click', () => {
            if (currentFontSize >= MAX_FONT_SIZE) return;
            currentFontSize = Math.min(currentFontSize + 2, MAX_FONT_SIZE);
            applyFontSize();
            updateFontButtons();
        });
        copyButton.addEventListener('click', async () => {
            const textToCopy = textElement.textContent;
            const originalText = copyButtonDefaultLabel;
            const successText = 'تم النسخ!';
            const errorText = 'تعذّر النسخ';
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(textToCopy);
                } else {
                    const textarea = document.createElement('textarea');
                    textarea.value = textToCopy;
                    textarea.style.position = 'fixed';
                    textarea.style.opacity = '0';
                    document.body.appendChild(textarea);
                    textarea.focus();
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                }
                copyButton.textContent = successText;
            } catch (copyError) {
                console.error('خطأ أثناء نسخ النص:', copyError);
                copyButton.textContent = errorText;
            } finally {
                copyButton.disabled = true;
                setTimeout(() => {
                    copyButton.textContent = originalText;
                    copyButton.disabled = false;
                }, 1500);
            }
        });

        let isEditing = false;
        editButton.addEventListener('click', () => {
            if (!isEditing) {
                isEditing = true;
                textElement.contentEditable = 'true';
                textElement.classList.add('editing');
                editButton.textContent = saveButtonLabel;
                textElement.focus();
                try {
                    const selection = window.getSelection();
                    if (selection) {
                        const range = document.createRange();
                        range.selectNodeContents(textElement);
                        range.collapse(false);
                        selection.removeAllRanges();
                        selection.addRange(range);
                    }
                } catch (selectionError) {
                    console.warn('تعذر تحديد مكان المؤشر بعد تفعيل التحرير:', selectionError);
                }
            } else {
                isEditing = false;
                textElement.contentEditable = 'false';
                textElement.classList.remove('editing');
                textElement.blur();
                editButton.textContent = editButtonDefaultLabel;
            }
        });

        // معالجة الصورة عبر Canvas
        const image = await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.src = imgURL;
        });
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);

        // تحويل إلى أبيض وأسود وزيادة التباين
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const avg = (data[i] + data[i+1] + data[i+2]) / 3;
            const contrast = 1.5;
            let val = contrast * (avg - 128) + 128;
            val = val > 255 ? 255 : val < 0 ? 0 : val;
            const bw = val > 180 ? 255 : 0;
            data[i] = data[i+1] = data[i+2] = bw;
        }
        ctx.putImageData(imageData, 0, 0);

        // تطبيق فلتر وضوح الحواف (sharpen)
        const sharpen = (ctx, w, h) => {
            const weights = [
                0, -1,  0,
               -1,  5, -1,
                0, -1,  0
            ];
            const side = 3;
            const halfSide = Math.floor(side / 2);
            const src = ctx.getImageData(0, 0, w, h);
            const sw = src.width;
            const sh = src.height;
            const srcData = src.data;
            const output = ctx.createImageData(sw, sh);
            const dstData = output.data;

            for (let y = 0; y < sh; y++) {
                for (let x = 0; x < sw; x++) {
                    let r = 0, g = 0, b = 0;
                    for (let cy = 0; cy < side; cy++) {
                        for (let cx = 0; cx < side; cx++) {
                            const scy = y + cy - halfSide;
                            const scx = x + cx - halfSide;
                            if (scy >= 0 && scy < sh && scx >= 0 && scx < sw) {
                                const srcOffset = (scy * sw + scx) * 4;
                                const wt = weights[cy * side + cx];
                                r += srcData[srcOffset] * wt;
                                g += srcData[srcOffset + 1] * wt;
                                b += srcData[srcOffset + 2] * wt;
                            }
                        }
                    }
                    const dstOffset = (y * sw + x) * 4;
                    dstData[dstOffset]     = Math.min(Math.max(r, 0), 255);
                    dstData[dstOffset + 1] = Math.min(Math.max(g, 0), 255);
                    dstData[dstOffset + 2] = Math.min(Math.max(b, 0), 255);
                    dstData[dstOffset + 3] = srcData[dstOffset + 3];
                }
            }
            ctx.putImageData(output, 0, 0);
        };
        sharpen(ctx, canvas.width, canvas.height);

        // استخراج الصورة المحسنة كـ dataURL
        const processedURL = canvas.toDataURL();

        try {
            const { data: { text } } = await Tesseract.recognize(
                processedURL,
                'ara+eng',
                {
                    logger: m => { /* يمكنك عرض تقدم المعالجة هنا إذا رغبت */ },
                    tessedit_preserve_interword_spaces: 1,
                }
            );

            let cleanText = text
                .replace(/صلى الله عليه وسلم|صلّى الله عليه وسلّم|صلى الله عليه و سلم/g, "ﷺ")
                .replace(/جل جلاله|جلّ جلاله/g, "ﷻ")
                .replace(/رضي الله عنه/g, "﵋")
                .replace(/عليه السلام/g, "ؑ");

            textElement.textContent = cleanText.trim();
            if (/[\u0600-\u06FF]/.test(cleanText)) {
                textElement.style.direction = 'rtl';
                textElement.style.textAlign = 'right';
            } else {
                textElement.style.direction = 'ltr';
                textElement.style.textAlign = 'left';
            }
            isEditing = false;
            textElement.contentEditable = 'false';
            textElement.classList.remove('editing');
            textElement.blur();
            copyButton.disabled = false;
            copyButton.textContent = copyButtonDefaultLabel;
            editButton.disabled = false;
            editButton.textContent = editButtonDefaultLabel;
            decreaseFontButton.disabled = false;
            increaseFontButton.disabled = false;
            updateFontButtons();
        } catch (err) {
            textElement.textContent = 'حدث خطأ أثناء المعالجة.';
            isEditing = false;
            textElement.contentEditable = 'false';
            textElement.classList.remove('editing');
            textElement.blur();
            copyButton.disabled = true;
            copyButton.textContent = 'تعذّر المعالجة';
            editButton.disabled = true;
            editButton.textContent = editButtonDefaultLabel;
            decreaseFontButton.disabled = true;
            increaseFontButton.disabled = true;
        }
    }
    if (showProgress) {
        progressBar.style.width = '100%';
        progressText.textContent = '100%';
        setTimeout(() => { progressBarContainer.style.display = 'none'; }, 1200);
    }
    loadingDiv.style.display = 'none';
}

document.getElementById('imageInput').addEventListener('change', function (e) {
    processFiles(Array.from(e.target.files));
});

document.getElementById('folderInput').addEventListener('change', function (e) {
    processFiles(Array.from(e.target.files));
});
